import data from "./catalog-data.json";
import { reusableTemplateDefinitionSchema, type TemplateItem } from "@/domain/rules/reusable-template-definition";

// Definitions are portable. No tenant IDs, dates or operational results belong here.
export const templateCatalog: TemplateItem[] = data.map(item => {
  const definition = reusableTemplateDefinitionSchema.parse(item.definition);
  return { reference: "catalog:" + item.id, id: item.id, origin: "CATALOG",
    status: "PUBLISHED", version: item.version, name: definition.name,
    description: definition.description, jobKey: definition.jobKey, definition };
});
