# Higgsfield model catalogue

The studio's Higgsfield models (`model_registry` rows) are generated from the
API's own documentation, so every control the Create page shows is one the API
accepts, with the values it accepts.

| File | What it is |
| - | - |
| `fetch-docs.mjs` | Crawls docs.higgsfield.ai (image and video categories → model families → workflows) and writes `catalog.json`. |
| `catalog.json` | The snapshot: each workflow's endpoint, family, docs link, usage notes and complete request JSON schema. |
| `curation.mjs` | What the schemas can't say: names, families, the studio operation, order, media roles, input rules and the odd restriction from a workflow's notes. |
| `build-registry.mjs` | Builds the rows, checks them against the schemas and writes `registry.json` and the migration `drizzle/migrations/0009_higgsfield_model_catalog.sql`. |

## Updating the catalogue

```sh
node scripts/higgsfield/fetch-docs.mjs      # refresh the snapshot
node scripts/higgsfield/build-registry.mjs  # rebuild, check, write the migration
```

The build fails, listing every problem, when:

- a documented endpoint has no curation entry, or a curation entry has no endpoint;
- a schema param is neither a control, a media input, a fixed value nor an explicit skip (with a reason);
- a control offers a value, default or range the schema doesn't allow;
- a param the API requires could ever be missing;
- a sample request built from a row (its defaults, and every control changed) fails the schema.

When Higgsfield changes a model, rebuild and ship the regenerated SQL as a new
migration (copy `0009` to the next number and add it to `meta/_journal.json`);
applied migrations are never edited. The upsert keeps each existing row's id,
on/off switch, UI overrides, "best for" text and still-valid stored defaults.
