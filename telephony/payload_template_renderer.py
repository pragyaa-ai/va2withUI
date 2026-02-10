from __future__ import annotations

import re
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple


PLACEHOLDER_PATTERN = re.compile(r"\{([^{}]+)\}")
CONDITIONAL_PATTERN = re.compile(
    r"^\s*([a-zA-Z0-9_.]+)\s*\?\s*(['\"])(.*?)\2\s*:\s*(['\"])(.*?)\4\s*$"
)


@dataclass
class TemplateRenderResult:
    payload: Any
    missing_placeholders: List[str]


def _parse_conditional(expr: str) -> Optional[Tuple[str, str, str]]:
    match = CONDITIONAL_PATTERN.match(expr)
    if not match:
        return None
    path = match.group(1)
    true_value = match.group(3)
    false_value = match.group(5)
    return path, true_value, false_value


def _get_value_from_path(data: Dict[str, Any], path: str) -> Any:
    current: Any = data
    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current


def _stringify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return str(value)
    return str(value)


def _render_string(
    value: str,
    context: Dict[str, Any],
    missing: List[str],
) -> Any:
    matches = list(PLACEHOLDER_PATTERN.finditer(value))
    if not matches:
        return value

    if value.strip() == matches[0].group(0) and len(matches) == 1:
        expr = matches[0].group(1).strip()
        conditional = _parse_conditional(expr)
        if conditional:
            path, true_value, false_value = conditional
            resolved = _get_value_from_path(context, path)
            if resolved is None:
                missing.append(path)
            return true_value if resolved else false_value

        resolved = _get_value_from_path(context, expr)
        if resolved is None:
            missing.append(expr)
            return ""
        return resolved

    rendered = value
    for match in matches:
        expr = match.group(1).strip()
        conditional = _parse_conditional(expr)
        if conditional:
            path, true_value, false_value = conditional
            resolved = _get_value_from_path(context, path)
            if resolved is None:
                missing.append(path)
            replacement = true_value if resolved else false_value
        else:
            resolved = _get_value_from_path(context, expr)
            if resolved is None:
                missing.append(expr)
                replacement = ""
            else:
                replacement = _stringify(resolved)
        rendered = rendered.replace(match.group(0), replacement)
    return rendered


def _render_value(
    value: Any,
    context: Dict[str, Any],
    missing: List[str],
) -> Any:
    if isinstance(value, dict):
        return {
            key: _render_value(child, context, missing)
            for key, child in value.items()
        }
    if isinstance(value, list):
        return [_render_value(item, context, missing) for item in value]
    if isinstance(value, str):
        return _render_string(value, context, missing)
    return value


def _reorder_si_payload(payload: Any) -> Any:
    """
    Reorder SI payload fields to match the standardized format.
    This ensures consistent field order regardless of database storage.
    """
    if not isinstance(payload, dict):
        return payload
    
    # Define the standard SI payload field order
    field_order = [
        "id",
        "customer_name",
        "call_ref_id",
        "call_vendor",
        "recording_url",
        "start_time",
        "end_time",
        "duration",
        "provider",
        "call_direction",
        "store_code",
        "customer_number",
        "language",
        "dealer_routing",
        "dropoff",
        "completion_status",
        "response_data",
    ]
    
    # Reorder top-level fields
    ordered = OrderedDict()
    for key in field_order:
        if key in payload:
            ordered[key] = payload[key]
    
    # Add any extra fields not in the standard order
    for key, value in payload.items():
        if key not in ordered:
            ordered[key] = value
    
    # Reorder response_data item fields if present
    if "response_data" in ordered and isinstance(ordered["response_data"], list):
        response_field_order = [
            "key_label",
            "key_value",
            "key_response",
            "attempts",
            "attempts_details",
            "remarks",
        ]
        ordered_items = []
        for item in ordered["response_data"]:
            if isinstance(item, dict):
                ordered_item = OrderedDict()
                for field in response_field_order:
                    if field in item:
                        ordered_item[field] = item[field]
                for field, value in item.items():
                    if field not in ordered_item:
                        ordered_item[field] = value
                ordered_items.append(ordered_item)
            else:
                ordered_items.append(item)
        ordered["response_data"] = ordered_items
    
    return ordered


def render_payload_template(
    template: Any,
    context: Dict[str, Any],
) -> TemplateRenderResult:
    missing: List[str] = []
    rendered = _render_value(template, context, missing)
    
    # Reorder SI payload fields for consistent formatting
    rendered = _reorder_si_payload(rendered)
    
    return TemplateRenderResult(payload=rendered, missing_placeholders=sorted(set(missing)))
