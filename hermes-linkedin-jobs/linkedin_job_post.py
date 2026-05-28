import argparse
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Iterable, Optional

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


DEFAULT_START_URL = "https://www.linkedin.com/feed/"
DEFAULT_COMPANY_NAME = "TheBackOfficeCompany"
DEFAULT_PROFILE_NAME = "default"
DEFAULT_JOB_TITLE = "Payroll Manager"


def hermes_home() -> Path:
    return Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))


def profile_dir(profile_name: str) -> Path:
    explicit_profile = os.environ.get("AGENT_BROWSER_PROFILE")
    if explicit_profile and profile_name == DEFAULT_PROFILE_NAME:
        return Path(explicit_profile)

    safe_name = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in profile_name)
    return hermes_home() / "browser-profiles" / f"linkedin-{safe_name}"


def chrome_path() -> Optional[Path]:
    candidates = [
        Path(os.environ.get("PROGRAMFILES", "")) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", "")) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Google" / "Chrome" / "Application" / "chrome.exe",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def launch_visible_login(profile_name: str, url: str) -> int:
    browser = chrome_path()
    if not browser:
        print("Chrome was not found. Install Google Chrome or update chrome_path() in linkedin_job_post.py.")
        return 1

    user_data_dir = profile_dir(profile_name)
    user_data_dir.mkdir(parents=True, exist_ok=True)
    args = [
        str(browser),
        f"--user-data-dir={user_data_dir}",
        "--no-first-run",
        "--new-window",
        url,
    ]
    subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"Opened LinkedIn in a persistent Hermes Chrome profile: {user_data_dir}")
    print("Sign in manually, then close that Chrome window before running status or draft automation.")
    return 0


def wait_lightly(page: Page) -> None:
    try:
        page.wait_for_load_state("domcontentloaded", timeout=15000)
    except PlaywrightTimeoutError:
        pass
    try:
        page.wait_for_load_state("networkidle", timeout=8000)
    except PlaywrightTimeoutError:
        pass


def close_popups(page: Page) -> None:
    names = ["Dismiss", "Close", "No, not right now", "Maybe later"]
    for name in names:
        try:
            button = page.get_by_role("button", name=name, exact=True)
            if button.count() and button.first.is_visible(timeout=1000):
                button.first.click(timeout=3000)
                wait_lightly(page)
        except PlaywrightError:
            continue

    for selector in [
        'button[aria-label="Dismiss"]',
        'button[aria-label="Close"]',
        'button[data-test-modal-close-btn]',
    ]:
        try:
            item = page.locator(selector)
            if item.count() and item.first.is_visible(timeout=1000):
                item.first.click(timeout=3000)
                wait_lightly(page)
        except PlaywrightError:
            continue


def first_visible(page: Page, role: str, names: Iterable[str], exact: bool = True):
    for name in names:
        try:
            locator = page.get_by_role(role, name=name, exact=exact)
            count = locator.count()
            for index in range(count):
                candidate = locator.nth(index)
                if candidate.is_visible(timeout=1000):
                    return candidate
        except PlaywrightError:
            continue
    return None


def click_first(page: Page, role: str, names: Iterable[str], exact: bool = True) -> bool:
    target = first_visible(page, role, names, exact=exact)
    if not target:
        return False
    target.click(timeout=10000)
    wait_lightly(page)
    close_popups(page)
    return True


def click_visible_locator(locator) -> bool:
    try:
        count = locator.count()
        for index in range(count):
            candidate = locator.nth(index)
            if candidate.is_visible(timeout=1000):
                candidate.click(timeout=10000)
                return True
    except PlaywrightError:
        return False
    return False


def fill_job_title(page: Page, job_title: str) -> bool:
    candidates = [
        lambda: page.get_by_label("Job title", exact=True),
        lambda: page.get_by_placeholder("Job title", exact=True),
        lambda: page.locator('input[name*="title" i]'),
        lambda: page.locator('input[aria-label*="Job title" i]'),
    ]
    for make_locator in candidates:
        try:
            locator = make_locator()
            count = locator.count()
            for index in range(count):
                candidate = locator.nth(index)
                if candidate.is_visible(timeout=1000):
                    candidate.fill(job_title, timeout=10000)
                    return True
        except PlaywrightError:
            continue
    return False


def fill_description_if_given(page: Page, description: str) -> bool:
    if not description.strip():
        return False

    candidates = [
        page.locator('[contenteditable="true"]'),
        page.get_by_role("textbox"),
        page.locator("textarea"),
    ]
    for locator in candidates:
        try:
            count = locator.count()
            for index in range(count):
                candidate = locator.nth(index)
                if candidate.is_visible(timeout=1000):
                    candidate.click(timeout=5000)
                    page.keyboard.press("Control+A")
                    page.keyboard.type(description)
                    return True
        except PlaywrightError:
            continue
    return False


def signed_in_status(page: Page) -> str:
    title = page.title()
    url = page.url
    login_markers = ["login", "uas/login", "checkpoint", "authwall"]
    if any(marker in url.lower() for marker in login_markers) or "sign in" in title.lower():
        return "not_signed_in"
    return "signed_in"


def is_login_or_checkpoint(page: Page) -> bool:
    title = page.title().lower()
    url = page.url.lower()
    login_markers = ["login", "uas/login", "checkpoint", "authwall"]
    return any(marker in url for marker in login_markers) or "sign in" in title


def page_has_visible_text(page: Page, pattern: str) -> bool:
    try:
        locator = page.get_by_text(re.compile(pattern, re.IGNORECASE))
        count = locator.count()
        for index in range(min(count, 5)):
            if locator.nth(index).is_visible(timeout=1000):
                return True
    except PlaywrightError:
        return False
    return False


def looks_like_company_jobs_page(page: Page) -> bool:
    if page_has_visible_text(page, r"manage your page.*job posts"):
        return True
    if first_visible(page, "button", ["Post a job for free", "Post a job"], exact=True):
        return True
    if first_visible(page, "link", ["Post a job for free", "Post a job"], exact=True):
        return True
    return False


def click_matching_link_or_text(page: Page, text: str) -> bool:
    pattern = re.compile(re.escape(text), re.IGNORECASE)
    locators = [
        page.get_by_role("link", name=pattern),
        page.locator("a").filter(has_text=pattern),
        page.get_by_text(pattern),
    ]
    for locator in locators:
        if click_visible_locator(locator):
            wait_lightly(page)
            close_popups(page)
            return True
    return False


def click_company_jobs_from_sidebar(page: Page) -> bool:
    jobs_text = re.compile(r"^\s*Jobs\s*$", re.IGNORECASE)
    locators = [
        page.locator('a[href*="/posted-jobs"]'),
        page.locator("a,button").filter(has_text=jobs_text),
        page.get_by_role("link", name=jobs_text),
        page.get_by_role("button", name=jobs_text),
    ]

    for locator in locators:
        try:
            count = locator.count()
            for index in range(count):
                candidate = locator.nth(index)
                if not candidate.is_visible(timeout=1000):
                    continue
                href = candidate.get_attribute("href") or ""
                box = candidate.bounding_box()
                is_sidebar = box is not None and box.get("x", 9999) < 430
                is_posted_jobs = "/posted-jobs" in href.lower()
                if not is_sidebar and not is_posted_jobs:
                    continue
                candidate.click(timeout=10000)
                wait_lightly(page)
                close_popups(page)
                return True
        except PlaywrightError:
            continue

    return False


def report_page(page: Page, step: str) -> None:
    print(f"step={step}")
    print(f"title={page.title()}")
    print(f"url={page.url}")


def context_for(profile_name: str):
    user_data_dir = profile_dir(profile_name)
    user_data_dir.mkdir(parents=True, exist_ok=True)
    browser = chrome_path()
    launch_args = {
        "headless": False,
        "viewport": {"width": 1365, "height": 768},
        "args": ["--disable-notifications"],
    }
    if browser:
        launch_args["executable_path"] = str(browser)
    playwright = sync_playwright().start()
    try:
        context = playwright.chromium.launch_persistent_context(str(user_data_dir), **launch_args)
    except PlaywrightError as exc:
        playwright.stop()
        print("Could not open the Hermes LinkedIn browser profile.")
        print("Close any Chrome window that was opened by open-linkedin-login.ps1, then retry.")
        print(str(exc))
        raise SystemExit(2)
    return playwright, context


def get_page(context) -> Page:
    if context.pages:
        return context.pages[0]
    return context.new_page()


def status(profile_name: str, url: str) -> int:
    playwright, context = context_for(profile_name)
    try:
        page = get_page(context)
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        wait_lightly(page)
        close_popups(page)
        state = signed_in_status(page)
        print(f"status={state}")
        print(f"title={page.title()}")
        print(f"url={page.url}")
        print(f"profile={profile_dir(profile_name)}")
        return 0 if state == "signed_in" else 3
    finally:
        context.close()
        playwright.stop()


def open_company_jobs(page: Page, start_url: str, company_name: str) -> None:
    page.goto(start_url, wait_until="domcontentloaded", timeout=60000)
    wait_lightly(page)
    close_popups(page)
    report_page(page, "opened_feed")

    if is_login_or_checkpoint(page):
        raise RuntimeError("LinkedIn is asking for login. Run open-linkedin-login.ps1 first.")

    if not click_matching_link_or_text(page, company_name):
        raise RuntimeError(f"Could not find the visible company link/text for {company_name} from LinkedIn feed.")

    report_page(page, "clicked_company_from_feed")

    if "/company/" in page.url.lower():
        page.reload(wait_until="domcontentloaded", timeout=60000)
        wait_lightly(page)
        close_popups(page)
        report_page(page, "reloaded_company_page")

    if is_login_or_checkpoint(page):
        raise RuntimeError("LinkedIn is asking for login after opening the company page.")

    if not looks_like_company_jobs_page(page):
        if not click_company_jobs_from_sidebar(page):
            raise RuntimeError(
                "Could not find the left-sidebar Jobs link on the company admin page. "
                f"Current URL: {page.url}"
            )
        report_page(page, "clicked_sidebar_jobs")

    if looks_like_company_jobs_page(page):
        return

    raise RuntimeError(
        "Could not reach the company Jobs posting page from the feed-click flow. "
        f"Current URL: {page.url}"
    )


def click_post_job(page: Page, context) -> Page:
    labels = ["Post a job for free", "Post a free job", "Post job for free", "Post a job"]
    target = first_visible(page, "button", labels, exact=True)
    if not target:
        target = first_visible(page, "link", labels, exact=True)
    if not target:
        raise RuntimeError("Could not find the LinkedIn 'Post a job for free' action.")

    before_pages = list(context.pages)
    try:
        with context.expect_page(timeout=7000) as page_info:
            target.click(timeout=10000)
        new_page = page_info.value
        wait_lightly(new_page)
        return new_page
    except PlaywrightTimeoutError:
        wait_lightly(page)
        for candidate in context.pages:
            if candidate not in before_pages:
                wait_lightly(candidate)
                return candidate
        return page


def continue_if_present(page: Page, label: str = "Continue") -> bool:
    if click_first(page, "button", [label], exact=True):
        return True
    if click_first(page, "button", [label], exact=False):
        return True

    text_pattern = re.compile(rf"^\s*{re.escape(label)}\s*$", re.IGNORECASE)
    if click_visible_locator(page.locator("button").filter(has_text=text_pattern)):
        wait_lightly(page)
        close_popups(page)
        return True

    return False


def run_draft(profile_name: str, start_url: str, company_name: str, job_title: str, description: str) -> int:
    playwright, context = context_for(profile_name)
    try:
        page = get_page(context)
        open_company_jobs(page, start_url, company_name)
        page = click_post_job(page, context)
        close_popups(page)
        report_page(page, "opened_post_job_flow")

        if not fill_job_title(page, job_title):
            raise RuntimeError("Could not find the Job title field.")
        print(f"filled_job_title={job_title}")

        if not continue_if_present(page):
            raise RuntimeError("Could not click Continue after job title.")
        print("continued_after_job_title=true")
        report_page(page, "after_job_title_continue")

        fill_description_if_given(page, description)
        if not continue_if_present(page):
            raise RuntimeError("Could not click Continue on job description page.")
        print("continued_after_description=true")
        report_page(page, "after_description_continue")

        if not continue_if_present(page):
            raise RuntimeError("Could not click Continue on job settings page.")
        print("continued_after_job_settings=true")
        report_page(page, "after_job_settings_continue")

        if click_first(page, "button", ["Skip for now"], exact=True):
            print("clicked_skip_for_now=true")
        else:
            print("clicked_skip_for_now=false")
            print("Skip for now was not visible. Stopped before final publish.")

        print("safety=stopped_before_final_publish")
        print(f"title={page.title()}")
        print(f"url={page.url}")
        return 0
    except Exception as exc:
        print(f"error={exc}")
        return 1
    finally:
        context.close()
        playwright.stop()


def main() -> int:
    parser = argparse.ArgumentParser(description="Hermes LinkedIn job posting helper.")
    parser.add_argument("--profile-name", default=DEFAULT_PROFILE_NAME)
    parser.add_argument("--start-url", default=os.environ.get("LINKEDIN_START_URL", DEFAULT_START_URL))
    parser.add_argument("--company-name", default=os.environ.get("LINKEDIN_COMPANY_NAME", DEFAULT_COMPANY_NAME))
    subcommands = parser.add_subparsers(dest="command", required=True)

    open_login_parser = subcommands.add_parser("open-login", help="Open a visible persistent browser for manual login.")
    open_login_parser.add_argument("--url", default="https://www.linkedin.com/feed/")

    status_parser = subcommands.add_parser("status", help="Check whether the LinkedIn profile is signed in.")
    status_parser.add_argument("--url", default="https://www.linkedin.com/feed/")

    subcommands.add_parser("open-jobs", help="Open TheBackOfficeCompany admin Jobs page and report the final URL.")

    draft_parser = subcommands.add_parser("draft", help="Create a LinkedIn job draft and stop before final publish.")
    draft_parser.add_argument("--job-title", default=DEFAULT_JOB_TITLE)
    draft_parser.add_argument("--description", default="")

    args = parser.parse_args()

    if args.command == "open-login":
        return launch_visible_login(args.profile_name, args.url)
    if args.command == "status":
        return status(args.profile_name, args.url)
    if args.command == "open-jobs":
        playwright, context = context_for(args.profile_name)
        try:
            page = get_page(context)
            open_company_jobs(page, args.start_url, args.company_name)
            print("status=company_jobs_open")
            print(f"title={page.title()}")
            print(f"url={page.url}")
            return 0
        except Exception as exc:
            print(f"error={exc}")
            return 1
        finally:
            context.close()
            playwright.stop()
    if args.command == "draft":
        return run_draft(args.profile_name, args.start_url, args.company_name, args.job_title, args.description)

    return 1


if __name__ == "__main__":
    sys.exit(main())
