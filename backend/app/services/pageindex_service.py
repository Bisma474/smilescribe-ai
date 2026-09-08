from app.core.config import settings

pi_client = None

MOCK_TREE = [
    {
        "name": "Periodontal",
        "children": [
            {"name": "Probing Depths", "children": [
                {"name": "Classification"},
                {"name": "Bleeding on Probing"},
                {"name": "6-site recording"},
            ]},
            {"name": "Scaling & Root Planing"},
            {"name": "Perio Maintenance"},
        ],
    },
    {
        "name": "Restorative",
        "children": [
            {"name": "Caries Classification"},
            {"name": "Existing Restorations"},
            {"name": "Composite Fillings"},
            {"name": "Crown & Bridge"},
        ],
    },
    {
        "name": "Preventive",
        "children": [
            {"name": "Fluoride Treatment"},
            {"name": "Sealants"},
            {"name": "Oral Hygiene Instruction"},
        ],
    },
    {
        "name": "Billing & Coding",
        "children": [
            {"name": "CDT Codes"},
            {"name": "Dental Insurance"},
            {"name": "Fee Schedules"},
        ],
    },
]

MOCK_CONTEXT = {
    "periodontal": (
        "Section: Periodontal > Probing Depths > Classification\n"
        "Periodontal probing depths are measured in millimeters from the gingival margin to the base of the pocket. "
        "Normal: 1-3mm. Mild: 4mm. Moderate: 5-6mm. Severe: 7mm+. Bleeding on probing indicates active inflammation. "
        "Full mouth probing with 6-site recording per tooth is standard for comprehensive perio evaluation."
    ),
    "caries": (
        "Section: Restorative > Caries Classification\n"
        "Caries (tooth decay) is classified by location and severity: Pit and fissure caries, smooth surface caries, "
        "root caries, recurrent caries. Treatment depends on extent: composite filling, inlay/onlay, or crown. "
        "Early lesions may be managed with fluoride remineralization."
    ),
    "restoration": (
        "Section: Restorative > Existing Restorations\n"
        "Existing restorations should be evaluated for marginal integrity, recurrent caries, and wear. "
        "Common materials: composite resin, amalgam, glass ionomer, ceramic. "
        "Occlusal composite restorations on molars typically last 5-7 years with proper placement."
    ),
    "fluoride": (
        "Section: Preventive > Fluoride Treatment\n"
        "Fluoride varnish (5% NaF) is applied to all tooth surfaces after prophylaxis or scaling. "
        "Benefits: remineralizes early enamel lesions, reduces sensitivity, prevents caries. "
        "Application: dry tooth surfaces, apply thin layer, patient should avoid eating/drinking for 30 min."
    ),
}


def _is_pageindex_configured():
    return bool(settings.PAGEINDEX_API_KEY) and bool(settings.PAGEINDEX_DOC_ID)


def _get_client():
    global pi_client
    if pi_client is None:
        try:
            from pageindex import PageIndexClient
            pi_client = PageIndexClient(api_key=settings.PAGEINDEX_API_KEY)
        except ImportError:
            raise ImportError(
                "pageindex SDK not installed. Run: pip install pageindex>=0.1.0"
            )
    return pi_client


def query_context(query: str) -> str:
    if not _is_pageindex_configured():
        for keyword, mock in MOCK_CONTEXT.items():
            if keyword in query.lower():
                return mock
        return (
            f"Section: General Dentistry\n"
            f"No specific PageIndex match found for '{query}'. "
            f"Mock context: This falls under general dental assessment and treatment planning."
        )

    client = _get_client()
    response = client.chat_completions(
        messages=[{"role": "user", "content": query}],
        doc_id=settings.PAGEINDEX_DOC_ID,
    )
    return response["choices"][0]["message"]["content"]


def _transform_node(node: dict) -> dict:
    name = node.get("name") or node.get("title") or ""
    transformed = {**node, "name": name, "title": name}
    children_list = node.get("nodes") or node.get("children")
    if children_list and isinstance(children_list, list):
        transformed["children"] = [_transform_node(c) for c in children_list if isinstance(c, dict)]
        transformed["nodes"] = transformed["children"]
    return transformed


def get_tree() -> list:
    if not _is_pageindex_configured():
        return MOCK_TREE

    client = _get_client()
    result = client.get_tree(settings.PAGEINDEX_DOC_ID)
    raw_tree = result.get("result", [])
    return [_transform_node(node) for node in raw_tree if isinstance(node, dict)]


def query_context_with_trace(query: str):
    if not _is_pageindex_configured():
        context = query_context(query)
        yield {"choices": [{"delta": {"content": context}}]}
        return

    client = _get_client()
    for chunk in client.chat_completions(
        messages=[{"role": "user", "content": query}],
        doc_id=settings.PAGEINDEX_DOC_ID,
        stream=True,
        stream_metadata=True,
    ):
        yield chunk
