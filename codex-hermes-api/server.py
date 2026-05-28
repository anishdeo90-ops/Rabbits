import asyncio
import json
import os
import tempfile
from pathlib import Path
from time import time
from typing import Any, Optional
from uuid import uuid4

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel


load_dotenv()

HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8010"))
API_KEY = os.getenv("HERMES_API_KEY", "change-this-to-your-secret-key")
PUBLIC_MODEL_NAME = os.getenv("HERMES_MODEL_NAME", "codex")
CODEX_COMMAND = os.getenv("CODEX_COMMAND", "codex")
CODEX_WORKDIR = os.getenv("CODEX_WORKDIR", str(Path.cwd()))
CODEX_TIMEOUT_SECONDS = int(os.getenv("CODEX_TIMEOUT_SECONDS", "600"))
CODEX_MODEL = os.getenv("CODEX_MODEL")

app = FastAPI(title="Codex Hermes API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: str
    content: Any = ""
    name: Optional[str] = None
    tool_call_id: Optional[str] = None
    tool_calls: Optional[list[dict[str, Any]]] = None


class ChatCompletionRequest(BaseModel):
    model: str = PUBLIC_MODEL_NAME
    messages: list[ChatMessage]
    stream: bool = False
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    tools: Optional[list[dict[str, Any]]] = None
    tool_choice: Optional[Any] = None


def unix_now() -> int:
    return int(time())


def check_key(
    authorization: Optional[str] = None,
    x_api_key: Optional[str] = None,
) -> None:
    bearer_prefix = "Bearer "
    bearer_key = (
        authorization[len(bearer_prefix) :].strip()
        if authorization and authorization.lower().startswith(bearer_prefix.lower())
        else None
    )

    if API_KEY and x_api_key != API_KEY and bearer_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


def text_from_content(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                if item.get("type") in {"text", "input_text"}:
                    parts.append(str(item.get("text", "")))
                elif "text" in item:
                    parts.append(str(item["text"]))
        return "\n".join(part for part in parts if part)
    return str(content)


def message_to_prompt_line(message: ChatMessage) -> str:
    role = message.role.lower()
    content = text_from_content(message.content).strip()

    if role == "tool":
        tool_label = f"tool result"
        if message.name:
            tool_label += f" from {message.name}"
        if message.tool_call_id:
            tool_label += f" ({message.tool_call_id})"
        return f"{tool_label}: {content}"

    if message.tool_calls:
        tool_calls_text = json.dumps(message.tool_calls, ensure_ascii=False)
        if content:
            return f"{role}: {content}\n{role} tool_calls: {tool_calls_text}"
        return f"{role} tool_calls: {tool_calls_text}"

    return f"{role}: {content}"


def build_codex_prompt(messages: list[ChatMessage]) -> str:
    system_parts: list[str] = []
    conversation_parts: list[str] = []

    for message in messages:
        content = text_from_content(message.content).strip()
        if not content and not message.tool_calls:
            continue

        role = message.role.lower()
        if role in {"system", "developer"}:
            system_parts.append(content)
        else:
            conversation_parts.append(message_to_prompt_line(message))

    prompt_parts: list[str] = []
    if system_parts:
        prompt_parts.append("System instructions:\n" + "\n\n".join(system_parts))
    if conversation_parts:
        prompt_parts.append("Conversation:\n" + "\n\n".join(conversation_parts))
    prompt_parts.append("Reply with the assistant's answer only.")
    return "\n\n".join(prompt_parts)


def build_tool_aware_codex_prompt(
    messages: list[ChatMessage],
    tools: list[dict[str, Any]],
    tool_choice: Optional[Any] = None,
) -> str:
    base_prompt = build_codex_prompt(messages)
    compact_tools = []
    for tool in tools:
        if not isinstance(tool, dict):
            continue
        function = tool.get("function") if tool.get("type") == "function" else tool
        if not isinstance(function, dict) or not function.get("name"):
            continue
        compact_tools.append(
            {
                "name": function.get("name"),
                "description": str(function.get("description", ""))[:1200],
                "parameters": function.get("parameters", {}),
            }
        )

    tools_json = json.dumps(compact_tools, ensure_ascii=False, indent=2)
    tool_choice_json = json.dumps(tool_choice, ensure_ascii=False)

    return f"""{base_prompt}

The caller supports OpenAI-compatible tool/function calls. You are choosing the next assistant message for Hermes Agent.

Available tools:
{tools_json}

tool_choice:
{tool_choice_json}

Return exactly one JSON object and no Markdown.

If you need Hermes to call one or more tools, return:
{{
  "type": "tool_calls",
  "tool_calls": [
    {{
      "name": "tool_name",
      "arguments": {{}}
    }}
  ]
}}

If you can answer the user directly, return:
{{
  "type": "final",
  "content": "assistant response text"
}}

Important:
- Do not claim that a command, browser action, or file edit happened unless a previous tool result message proves it.
- Use one tool step at a time when you need to observe results before deciding.
"""


def strip_json_fence(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if lines and lines[0].strip().startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()
    return stripped


def parse_tool_aware_response(text: str) -> dict[str, Any]:
    cleaned = strip_json_fence(text)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        return {"type": "final", "content": text}

    if not isinstance(parsed, dict):
        return {"type": "final", "content": text}

    if parsed.get("type") == "tool_calls" and isinstance(parsed.get("tool_calls"), list):
        valid_calls = []
        for call in parsed["tool_calls"]:
            if not isinstance(call, dict) or not call.get("name"):
                continue
            arguments = call.get("arguments", {})
            if isinstance(arguments, str):
                try:
                    arguments = json.loads(arguments)
                except json.JSONDecodeError:
                    arguments = {"input": arguments}
            if not isinstance(arguments, dict):
                arguments = {"input": arguments}
            valid_calls.append({"name": str(call["name"]), "arguments": arguments})
        if valid_calls:
            return {"type": "tool_calls", "tool_calls": valid_calls}

    if parsed.get("type") == "final" and "content" in parsed:
        return {"type": "final", "content": str(parsed.get("content") or "")}

    if "content" in parsed:
        return {"type": "final", "content": str(parsed.get("content") or "")}

    return {"type": "final", "content": text}


def resolve_codex_model(requested_model: str) -> Optional[str]:
    if CODEX_MODEL:
        return CODEX_MODEL
    if requested_model and requested_model not in {PUBLIC_MODEL_NAME, "default", "codex"}:
        return requested_model
    return None


async def run_codex(prompt: str, requested_model: str) -> str:
    output_path = Path(tempfile.gettempdir()) / f"codex-hermes-{uuid4()}.txt"
    cmd = [
        CODEX_COMMAND,
        "exec",
        "--skip-git-repo-check",
        "--ephemeral",
        "--sandbox",
        "read-only",
        "--color",
        "never",
        "-o",
        str(output_path),
    ]

    codex_model = resolve_codex_model(requested_model)
    if codex_model:
        cmd.extend(["-m", codex_model])

    cmd.append("-")

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=CODEX_WORKDIR,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            process.communicate(prompt.encode("utf-8")),
            timeout=CODEX_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        if "process" in locals() and process.returncode is None:
            process.kill()
            await process.wait()
        raise HTTPException(status_code=504, detail="Codex request timed out") from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=f"Codex command not found: {CODEX_COMMAND}") from exc

    if process.returncode != 0:
        error_text = stderr.decode("utf-8", errors="replace").strip()
        output_text = stdout.decode("utf-8", errors="replace").strip()
        detail = error_text or output_text or f"Codex exited with code {process.returncode}"
        output_path.unlink(missing_ok=True)
        raise HTTPException(status_code=502, detail=detail[-4000:])

    try:
        text = output_path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        text = stdout.decode("utf-8", errors="replace").strip()
    finally:
        output_path.unlink(missing_ok=True)

    if not text:
        raise HTTPException(status_code=502, detail="Codex returned an empty response")

    return text


def completion_payload(request_id: str, model: str, content: str) -> dict:
    return {
        "id": request_id,
        "object": "chat.completion",
        "created": unix_now(),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        },
    }


def openai_tool_calls(tool_calls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    openai_tool_calls = []
    for call in tool_calls:
        openai_tool_calls.append(
            {
                "id": f"call_{uuid4().hex}",
                "type": "function",
                "function": {
                    "name": call["name"],
                    "arguments": json.dumps(call["arguments"], ensure_ascii=False),
                },
            }
        )
    return openai_tool_calls


def tool_calls_payload(request_id: str, model: str, tool_calls: list[dict[str, Any]]) -> dict:
    return {
        "id": request_id,
        "object": "chat.completion",
        "created": unix_now(),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": openai_tool_calls(tool_calls),
                },
                "finish_reason": "tool_calls",
            }
        ],
        "usage": {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        },
    }


def sse_chunk(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def stream_completion(request_id: str, model: str, content: str):
    created = unix_now()
    yield sse_chunk(
        {
            "id": request_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}],
        }
    )
    yield sse_chunk(
        {
            "id": request_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [{"index": 0, "delta": {"content": content}, "finish_reason": None}],
        }
    )
    yield sse_chunk(
        {
            "id": request_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
        }
    )
    yield "data: [DONE]\n\n"


async def stream_tool_calls(request_id: str, model: str, tool_calls: list[dict[str, Any]]):
    created = unix_now()
    yield sse_chunk(
        {
            "id": request_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}],
        }
    )

    for index, call in enumerate(openai_tool_calls(tool_calls)):
        yield sse_chunk(
            {
                "id": request_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model,
                "choices": [
                    {
                        "index": 0,
                        "delta": {
                            "tool_calls": [
                                {
                                    "index": index,
                                    "id": call["id"],
                                    "type": "function",
                                    "function": {
                                        "name": call["function"]["name"],
                                        "arguments": call["function"]["arguments"],
                                    },
                                }
                            ]
                        },
                        "finish_reason": None,
                    }
                ],
            }
        )

    yield sse_chunk(
        {
            "id": request_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [{"index": 0, "delta": {}, "finish_reason": "tool_calls"}],
        }
    )
    yield "data: [DONE]\n\n"


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "service": "codex-hermes-api",
        "model": PUBLIC_MODEL_NAME,
    }


@app.get("/v1/models")
async def list_models(
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None),
) -> dict:
    check_key(authorization=authorization, x_api_key=x_api_key)
    return {
        "object": "list",
        "data": [
            {
                "id": PUBLIC_MODEL_NAME,
                "object": "model",
                "created": 0,
                "owned_by": "local-codex",
            }
        ],
    }


@app.post("/v1/chat/completions")
async def create_chat_completion(
    payload: ChatCompletionRequest,
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None),
):
    check_key(authorization=authorization, x_api_key=x_api_key)
    if not payload.messages:
        raise HTTPException(status_code=400, detail="messages cannot be empty")

    request_id = f"chatcmpl-{uuid4()}"
    if payload.tools:
        prompt = build_tool_aware_codex_prompt(payload.messages, payload.tools, payload.tool_choice)
        content = await run_codex(prompt, payload.model)
        parsed = parse_tool_aware_response(content)
        if parsed["type"] == "tool_calls":
            if payload.stream:
                return StreamingResponse(
                    stream_tool_calls(request_id, payload.model, parsed["tool_calls"]),
                    media_type="text/event-stream",
                )
            return tool_calls_payload(request_id, payload.model, parsed["tool_calls"])

        content = parsed["content"]
    else:
        prompt = build_codex_prompt(payload.messages)
        content = await run_codex(prompt, payload.model)

    if payload.stream:
        return StreamingResponse(
            stream_completion(request_id, payload.model, content),
            media_type="text/event-stream",
        )

    return completion_payload(request_id, payload.model, content)


if __name__ == "__main__":
    uvicorn.run("server:app", host=HOST, port=PORT, reload=False)
