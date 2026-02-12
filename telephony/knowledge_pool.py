"""
Knowledge Pool Integration for Telephony Service

This module fetches human-labeled data corrections from the Admin UI
and uses them to improve VoiceAgent accuracy by providing context
for difficult-to-capture terms.
"""

import urllib.request
import urllib.error
import json
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta


class KnowledgePool:
    """Manages access to human-labeled knowledge pool for improved accuracy."""
    
    def __init__(self, admin_url: str, agent_slug: str):
        """
        Initialize knowledge pool client.
        
        Args:
            admin_url: Base URL of Admin UI (e.g., "http://localhost:3100")
            agent_slug: Agent slug (e.g., "spotlight", "tata", "skoda")
        """
        self.admin_url = admin_url.rstrip("/")
        self.agent_slug = agent_slug
        self._cache: Optional[Dict[str, Any]] = None
        self._cache_timestamp: Optional[datetime] = None
        self._cache_ttl = timedelta(minutes=15)  # Cache for 15 minutes
    
    def fetch_knowledge(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Fetch knowledge pool from Admin UI.
        
        Args:
            force_refresh: Force refresh cache even if not expired
            
        Returns:
            Knowledge pool data with corrections grouped by field
        """
        # Return cached data if fresh
        if (
            not force_refresh
            and self._cache
            and self._cache_timestamp
            and datetime.now() - self._cache_timestamp < self._cache_ttl
        ):
            return self._cache
        
        try:
            url = f"{self.admin_url}/api/knowledge-pool?voiceAgentSlug={self.agent_slug}&onlyCorrections=true&limit=100"
            req = urllib.request.Request(url, method="GET")
            req.add_header("Accept", "application/json")
            
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    self._cache = data
                    self._cache_timestamp = datetime.now()
                    print(f"[KnowledgePool] Fetched {data.get('totalCount', 0)} corrections for {self.agent_slug}")
                    return data
                else:
                    print(f"[KnowledgePool] Failed to fetch: HTTP {resp.status}")
                    return {"knowledgePool": [], "groupedByField": {}, "totalCount": 0}
        except Exception as e:
            print(f"[KnowledgePool] Error fetching knowledge: {e}")
            return {"knowledgePool": [], "groupedByField": {}, "totalCount": 0}
    
    def get_field_corrections(self, field_name: str) -> List[Dict[str, Any]]:
        """
        Get all corrections for a specific field.
        
        Args:
            field_name: Field name (e.g., "name", "model", "email")
            
        Returns:
            List of corrections for that field
        """
        data = self.fetch_knowledge()
        grouped = data.get("groupedByField", {})
        return grouped.get(field_name, [])
    
    def build_context_prompt(self, field_name: str, max_examples: int = 5) -> str:
        """
        Build a context prompt with examples of commonly misheard terms.
        
        Args:
            field_name: Field name to get examples for
            max_examples: Maximum number of examples to include
            
        Returns:
            Context prompt string with examples
        """
        corrections = self.get_field_corrections(field_name)
        
        if not corrections:
            return ""
        
        # Sort by most recent and limit
        corrections = sorted(corrections, key=lambda x: x.get("labeledAt", ""), reverse=True)
        corrections = corrections[:max_examples]
        
        # Build examples
        examples = []
        for correction in corrections:
            original = correction.get("originalValue", "").strip()
            corrected = correction.get("correctedValue", "").strip()
            reason = correction.get("correctionReason", "")
            utterance = correction.get("userUtterance", "")
            
            if not corrected:
                continue
            
            example_parts = []
            if original and original != corrected:
                example_parts.append(f'Incorrectly heard as "{original}"')
            example_parts.append(f'Correct value: "{corrected}"')
            if reason:
                example_parts.append(f"({reason})")
            if utterance:
                example_parts.append(f'User said: "{utterance}"')
            
            examples.append(" - " + ", ".join(example_parts))
        
        if not examples:
            return ""
        
        field_labels = {
            "name": "customer names",
            "model": "car models",
            "email": "email addresses",
            "test_drive": "test drive responses",
        }
        label = field_labels.get(field_name, field_name)
        
        prompt = f"\n\n**Common Mistakes for {label.title()}:**\n"
        prompt += "\n".join(examples)
        prompt += f"\n\nPay special attention to these terms when extracting {label}."
        
        return prompt
    
    def augment_system_instructions(
        self,
        base_instructions: str,
        fields: List[str] = ["name", "model", "email"]
    ) -> str:
        """
        Augment system instructions with knowledge pool context.
        
        Args:
            base_instructions: Original system instructions
            fields: List of field names to add context for
            
        Returns:
            Augmented instructions with knowledge pool examples
        """
        # Fetch knowledge pool
        data = self.fetch_knowledge()
        total_corrections = data.get("totalCount", 0)
        
        if total_corrections == 0:
            return base_instructions
        
        # Build context for each field
        augmentation = "\n\n---\n**KNOWLEDGE POOL - Learn from Past Corrections**\n"
        augmentation += f"Based on {total_corrections} human-verified corrections:\n"
        
        for field in fields:
            context = self.build_context_prompt(field, max_examples=3)
            if context:
                augmentation += context
        
        return base_instructions + augmentation
    
    def get_stats(self) -> Dict[str, Any]:
        """Get statistics about the knowledge pool."""
        data = self.fetch_knowledge()
        grouped = data.get("groupedByField", {})
        
        stats = {
            "total_corrections": data.get("totalCount", 0),
            "by_field": {},
        }
        
        for field, corrections in grouped.items():
            stats["by_field"][field] = {
                "count": len(corrections),
                "recent": corrections[0].get("labeledAt") if corrections else None,
            }
        
        return stats


# Example usage in main.py:
# from knowledge_pool import KnowledgePool
#
# knowledge = KnowledgePool(admin_url="http://localhost:3100", agent_slug="spotlight")
# augmented_instructions = knowledge.augment_system_instructions(
#     base_instructions=system_instructions,
#     fields=["name", "model", "email"]
# )
