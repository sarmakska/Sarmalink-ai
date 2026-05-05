"""
Python example — uses the official openai SDK.

Install:    pip install openai
Run:        python examples/python.py

Same pattern as TypeScript: point base_url at SarmaLink-AI and
the existing OpenAI client speaks straight to it.
"""

import os
import sys

from openai import OpenAI

client = OpenAI(
    base_url=f"{os.getenv('SARMALINK_AI_URL', 'http://localhost:3000')}/api/v1",
    api_key=os.getenv("SARMALINK_AI_KEY", "sk-set-this"),
)


def non_streaming() -> None:
    print("── Non-streaming ──")
    completion = client.chat.completions.create(
        model="smart",
        messages=[{"role": "user", "content": "Reply with the single word: pong"}],
    )
    print(completion.choices[0].message.content)


def streaming() -> None:
    print("\n── Streaming ──")
    stream = client.chat.completions.create(
        model="smart",
        messages=[{"role": "user", "content": "List three UK cities, one per line."}],
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            sys.stdout.write(delta)
            sys.stdout.flush()
    print()


if __name__ == "__main__":
    non_streaming()
    streaming()
