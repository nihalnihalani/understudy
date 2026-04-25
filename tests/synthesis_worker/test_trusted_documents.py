"""Trusted-doc emission walks the SDL and produces one named op per Query/Mutation field."""

from __future__ import annotations

from trusted_documents import emit_trusted_documents  # noqa: E402  (sys.path injected by conftest)

ORDERS_SDL = """
type Query {
  orders(filter: OrderFilter!, first: Int = 25): [Order!]!
  order(id: ID!): Order
}
type Mutation {
  exportOrdersCsv(filter: OrderFilter!): OrderExport!
}
input OrderFilter { status: String }
type Order { id: ID! }
type OrderExport { id: ID! }
"""


def test_emits_one_doc_per_query_and_mutation_field() -> None:
    docs = emit_trusted_documents(ORDERS_SDL, agent_name="agent_orders")
    names = sorted(d.name for d in docs)
    assert names == ["ExportOrdersCsv", "Order", "Orders"]
    by_name = {d.name: d for d in docs}
    assert by_name["Orders"].operation_type == "query"
    assert by_name["ExportOrdersCsv"].operation_type == "mutation"
    # Args must be wired through with their declared types.
    assert "$filter: OrderFilter!" in by_name["Orders"].body
    assert "$first: Int = 25" in by_name["Orders"].body
    assert "orders(filter: $filter, first: $first)" in by_name["Orders"].body


def test_skips_subscriptions() -> None:
    sdl = "type Query { x: Int } type Subscription { tick: Int }"
    docs = emit_trusted_documents(sdl, agent_name="agent_t")
    assert {d.name for d in docs} == {"X"}
