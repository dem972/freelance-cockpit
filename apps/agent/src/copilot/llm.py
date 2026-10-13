"""OpenAI models, created only when a key is configured."""

from typing import Protocol

from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from .config import Settings

EMBEDDING_DIMENSIONS = 1536


class Embedder(Protocol):
    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...
    def embed_query(self, text: str) -> list[float]: ...


class AiDisabledError(RuntimeError):
    def __init__(self) -> None:
        super().__init__("OPENAI_API_KEY n'est pas configurée : le copilot est désactivé.")


def chat_model(settings: Settings, fast: bool = False) -> BaseChatModel:
    if settings.openai_api_key is None or not settings.ai_enabled:
        raise AiDisabledError()
    return ChatOpenAI(
        model=settings.openai_model_fast if fast else settings.openai_model,
        api_key=settings.openai_api_key,
        # Tool calling on current OpenAI models goes through the Responses API.
        use_responses_api=True,
        timeout=120,
        max_retries=2,
    )


def embedder(settings: Settings) -> Embedder:
    if settings.openai_api_key is None or not settings.ai_enabled:
        raise AiDisabledError()
    return OpenAIEmbeddings(
        model=settings.openai_embedding_model,
        api_key=settings.openai_api_key,
        dimensions=EMBEDDING_DIMENSIONS,
    )
