"""Walk a generated SDL and emit one named GraphQL operation per Query/Mutation field.

Each synthesized agent uses a catchall resolver (apps/agent-template/src/graphql/server.ts)
that dispatches by field name to the core loop. So the trusted-doc set is fully derivable
from the SDL — no Gemini call needed. Subscriptions are intentionally skipped (Connect
doesn't support streaming subscriptions in this Cosmo version).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from graphql import parse
from graphql.language.ast import (
    DocumentNode,
    FieldDefinitionNode,
    ListTypeNode,
    NamedTypeNode,
    NonNullTypeNode,
    ObjectTypeDefinitionNode,
    TypeNode,
)


@dataclass(frozen=True)
class TrustedDocument:
    name: str  # PascalCase op name
    operation_type: str  # "query" | "mutation"
    field_name: str  # original field name on Query/Mutation
    body: str  # serialized GraphQL operation text


def emit_trusted_documents(sdl: str, *, agent_name: str) -> list[TrustedDocument]:
    """Parse `sdl` and return one TrustedDocument per Query/Mutation field."""
    doc: DocumentNode = parse(sdl)
    out: list[TrustedDocument] = []
    for definition in doc.definitions:
        if not isinstance(definition, ObjectTypeDefinitionNode):
            continue
        type_name = definition.name.value
        if type_name not in ("Query", "Mutation"):
            continue
        op_kw = "query" if type_name == "Query" else "mutation"
        for field in definition.fields or ():
            out.append(_field_to_doc(field, op_kw))
    return out


def _field_to_doc(field: FieldDefinitionNode, op_kw: str) -> TrustedDocument:
    field_name = field.name.value
    op_name = field_name[:1].upper() + field_name[1:]
    var_decls: list[str] = []
    arg_passes: list[str] = []
    for arg in field.arguments or ():
        type_str = _serialize_type(arg.type)
        default = ""
        if arg.default_value is not None:
            default = f" = {_serialize_value(arg.default_value)}"
        var_decls.append(f"${arg.name.value}: {type_str}{default}")
        arg_passes.append(f"{arg.name.value}: ${arg.name.value}")
    var_block = f"({', '.join(var_decls)})" if var_decls else ""
    arg_block = f"({', '.join(arg_passes)})" if arg_passes else ""
    body = f"{op_kw} {op_name}{var_block} {{\n  {field_name}{arg_block}\n}}\n"
    return TrustedDocument(
        name=op_name,
        operation_type=op_kw,
        field_name=field_name,
        body=body,
    )


def _serialize_type(node: TypeNode) -> str:
    if isinstance(node, NonNullTypeNode):
        return f"{_serialize_type(node.type)}!"
    if isinstance(node, ListTypeNode):
        return f"[{_serialize_type(node.type)}]"
    assert isinstance(node, NamedTypeNode)
    return node.name.value


def _serialize_value(node: Any) -> str:
    # Conservative: cover the literals the SDL emitter actually produces.
    from graphql.language.ast import (
        BooleanValueNode,
        EnumValueNode,
        FloatValueNode,
        IntValueNode,
        StringValueNode,
    )

    if isinstance(node, (IntValueNode, FloatValueNode, EnumValueNode)):
        return str(node.value)
    if isinstance(node, BooleanValueNode):
        return "true" if node.value else "false"
    if isinstance(node, StringValueNode):
        return f'"{node.value}"'
    return str(node)
