-- Add ai_knowledge_base category referenced by IR chat knowledge base feature
INSERT INTO ir_document_categories (value, comment) VALUES
  ('ai_knowledge_base', 'Documents used as AI assistant knowledge base')
ON CONFLICT (value) DO NOTHING;
