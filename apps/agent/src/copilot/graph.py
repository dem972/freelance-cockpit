"""The copilot graph: model ⇄ tools, with interrupts for writes and Postgres checkpoints."""

from datetime import date
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import SystemMessage
from langchain_core.tools import BaseTool
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from .prompts import COPILOT


def build_copilot(
    model: BaseChatModel,
    tools: list[BaseTool],
    checkpointer: BaseCheckpointSaver[Any] | None,
    year: int,
    today: date | None = None,
) -> CompiledStateGraph[Any, Any, Any, Any]:
    # One tool call at a time: each write gets its own confirmation.
    bound = model.bind_tools(tools, parallel_tool_calls=False)
    system = SystemMessage(COPILOT.format(today=(today or date.today()).isoformat(), year=year))

    def agent(state: MessagesState) -> dict[str, Any]:
        return {"messages": [bound.invoke([system, *state["messages"]])]}

    graph = StateGraph(MessagesState)
    graph.add_node("agent", agent)
    graph.add_node("tools", ToolNode(tools))
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", tools_condition, {"tools": "tools", END: END})
    graph.add_edge("tools", "agent")
    return graph.compile(checkpointer=checkpointer)
