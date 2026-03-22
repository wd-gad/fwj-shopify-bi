const fs = require("fs");
const path = require("path");
const {
  addTags,
  fetchCustomerByEmail,
  fetchProductByHandle,
  removeTags,
  setMetafields,
  updateProduct,
  updateProductVariants
} = require("../src/lib/shopify-admin");

function printUsage() {
  console.log(`
Usage:
  node --env-file=.env scripts/shopify-config-cli.js <validate|plan|apply> --manifest <path> [--report <path>]

Manifest shape:
  {
    "products": [
      {
        "handle": "contest-entry-men-physique",
        "title": "Optional title",
        "status": "ACTIVE",
        "productType": "Contest Entry",
        "tags": { "add": ["還元対象"], "remove": ["old-tag"] },
        "metafields": [
          {
            "namespace": "fwj",
            "key": "purchase_eligibility",
            "type": "single_line_text_field",
            "value": "member_only"
          }
        ],
        "variants": [
          {
            "sku": "ENTRY-001",
            "price": "11000",
            "compareAtPrice": "13000"
          }
        ]
      }
    ],
    "customers": [
      {
        "email": "member@example.com",
        "tags": { "add": ["FWJカード会員"], "remove": ["停止中"] },
        "metafields": [
          {
            "namespace": "fwj",
            "key": "member_rank",
            "type": "single_line_text_field",
            "value": "Titan"
          }
        ]
      }
    ]
  }
  `);
}

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  const args = {
    mode,
    manifestPath: null,
    reportPath: null
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--manifest") {
      args.manifestPath = rest[index + 1];
      index += 1;
    } else if (token === "--report") {
      args.reportPath = rest[index + 1];
      index += 1;
    } else if (token === "--help" || token === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!args.mode || !["validate", "plan", "apply"].includes(args.mode)) {
    throw new Error("Mode must be one of: validate, plan, apply");
  }

  if (!args.manifestPath) {
    throw new Error("--manifest is required");
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function uniqStrings(values) {
  return [...new Set(ensureArray(values).filter((value) => typeof value === "string" && value.trim()))];
}

function sortStrings(values) {
  return [...values].sort((left, right) => left.localeCompare(right, "ja"));
}

function buildMetafieldMap(metafields) {
  const map = new Map();
  for (const metafield of ensureArray(metafields)) {
    map.set(`${metafield.namespace}.${metafield.key}`, metafield);
  }
  return map;
}

function validateMetafield(metafield, pointer, errors) {
  if (!metafield || typeof metafield !== "object") {
    errors.push(`${pointer} must be an object`);
    return;
  }

  for (const key of ["namespace", "key", "type", "value"]) {
    if (typeof metafield[key] !== "string" || !metafield[key].trim()) {
      errors.push(`${pointer}.${key} must be a non-empty string`);
    }
  }
}

function validateManifest(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    errors.push("Manifest must be a JSON object");
    return errors;
  }

  for (const [groupName, identifier] of [
    ["products", "handle"],
    ["customers", "email"]
  ]) {
    const group = manifest[groupName];
    if (group == null) {
      continue;
    }
    if (!Array.isArray(group)) {
      errors.push(`${groupName} must be an array`);
      continue;
    }

    group.forEach((entry, index) => {
      const pointer = `${groupName}[${index}]`;
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        errors.push(`${pointer} must be an object`);
        return;
      }

      if (typeof entry[identifier] !== "string" || !entry[identifier].trim()) {
        errors.push(`${pointer}.${identifier} must be a non-empty string`);
      }

      if (entry.tags != null) {
        if (typeof entry.tags !== "object" || Array.isArray(entry.tags)) {
          errors.push(`${pointer}.tags must be an object`);
        } else {
          for (const key of ["add", "remove"]) {
            if (entry.tags[key] != null && !Array.isArray(entry.tags[key])) {
              errors.push(`${pointer}.tags.${key} must be an array`);
            }
          }
        }
      }

      if (entry.metafields != null) {
        if (!Array.isArray(entry.metafields)) {
          errors.push(`${pointer}.metafields must be an array`);
        } else {
          entry.metafields.forEach((metafield, metafieldIndex) => {
            validateMetafield(metafield, `${pointer}.metafields[${metafieldIndex}]`, errors);
          });
        }
      }

      if (groupName === "products" && entry.variants != null) {
        if (!Array.isArray(entry.variants)) {
          errors.push(`${pointer}.variants must be an array`);
        } else {
          entry.variants.forEach((variant, variantIndex) => {
            const variantPointer = `${pointer}.variants[${variantIndex}]`;
            if (!variant || typeof variant !== "object" || Array.isArray(variant)) {
              errors.push(`${variantPointer} must be an object`);
              return;
            }
            if (typeof variant.sku !== "string" || !variant.sku.trim()) {
              errors.push(`${variantPointer}.sku must be a non-empty string`);
            }
            if (variant.price != null && typeof variant.price !== "string") {
              errors.push(`${variantPointer}.price must be a string`);
            }
            if (variant.compareAtPrice != null && typeof variant.compareAtPrice !== "string") {
              errors.push(`${variantPointer}.compareAtPrice must be a string or null`);
            }
          });
        }
      }
    });
  }

  return errors;
}

function buildProductPlan(desired, current) {
  const plan = {
    kind: "product",
    identifier: desired.handle,
    found: Boolean(current),
    productId: current?.id ?? null,
    update: null,
    tags: null,
    metafields: [],
    variants: []
  };

  if (!current) {
    return plan;
  }

  const update = {
    id: current.id
  };

  let hasProductFieldChange = false;
  for (const field of ["title", "status", "productType"]) {
    if (desired[field] != null && desired[field] !== current[field]) {
      update[field] = desired[field];
      hasProductFieldChange = true;
    }
  }

  plan.update = hasProductFieldChange
    ? {
        input: update,
        before: {
          title: current.title,
          status: current.status,
          productType: current.productType
        }
      }
    : null;

  const currentTagSet = new Set(current.tags || []);
  const tagsToAdd = uniqStrings(desired.tags?.add).filter((tag) => !currentTagSet.has(tag));
  const tagsToRemove = uniqStrings(desired.tags?.remove).filter((tag) => currentTagSet.has(tag));
  if (tagsToAdd.length || tagsToRemove.length) {
    plan.tags = {
      id: current.id,
      add: sortStrings(tagsToAdd),
      remove: sortStrings(tagsToRemove)
    };
  }

  const metafieldMap = buildMetafieldMap(current.metafields);
  for (const metafield of ensureArray(desired.metafields)) {
    const key = `${metafield.namespace}.${metafield.key}`;
    const existing = metafieldMap.get(key);
    if (!existing || existing.value !== metafield.value || existing.type !== metafield.type) {
      plan.metafields.push({
        ownerId: current.id,
        namespace: metafield.namespace,
        key: metafield.key,
        type: metafield.type,
        value: metafield.value,
        compareDigest: existing?.compareDigest ?? null,
        before: existing ? { type: existing.type, value: existing.value } : null
      });
    }
  }

  const variantBySku = new Map((current.variants || []).map((variant) => [variant.sku, variant]));
  for (const desiredVariant of ensureArray(desired.variants)) {
    const currentVariant = variantBySku.get(desiredVariant.sku);
    if (!currentVariant) {
      plan.variants.push({
        sku: desiredVariant.sku,
        error: "Variant not found"
      });
      continue;
    }

    const variantUpdate = {
      id: currentVariant.id
    };
    let hasVariantChange = false;

    for (const field of ["price", "compareAtPrice"]) {
      if (Object.prototype.hasOwnProperty.call(desiredVariant, field)) {
        const desiredValue = desiredVariant[field] == null ? null : String(desiredVariant[field]);
        const currentValue = currentVariant[field] == null ? null : String(currentVariant[field]);
        if (desiredValue !== currentValue) {
          variantUpdate[field] = desiredValue;
          hasVariantChange = true;
        }
      }
    }

    if (hasVariantChange) {
      plan.variants.push({
        sku: desiredVariant.sku,
        input: variantUpdate,
        before: {
          price: currentVariant.price,
          compareAtPrice: currentVariant.compareAtPrice
        }
      });
    }
  }

  return plan;
}

function buildCustomerPlan(desired, current) {
  const plan = {
    kind: "customer",
    identifier: desired.email,
    found: Boolean(current),
    tags: null,
    metafields: []
  };

  if (!current) {
    return plan;
  }

  const currentTagSet = new Set(current.tags || []);
  const tagsToAdd = uniqStrings(desired.tags?.add).filter((tag) => !currentTagSet.has(tag));
  const tagsToRemove = uniqStrings(desired.tags?.remove).filter((tag) => currentTagSet.has(tag));
  if (tagsToAdd.length || tagsToRemove.length) {
    plan.tags = {
      id: current.id,
      add: sortStrings(tagsToAdd),
      remove: sortStrings(tagsToRemove)
    };
  }

  const metafieldMap = buildMetafieldMap(current.metafields);
  for (const metafield of ensureArray(desired.metafields)) {
    const key = `${metafield.namespace}.${metafield.key}`;
    const existing = metafieldMap.get(key);
    if (!existing || existing.value !== metafield.value || existing.type !== metafield.type) {
      plan.metafields.push({
        ownerId: current.id,
        namespace: metafield.namespace,
        key: metafield.key,
        type: metafield.type,
        value: metafield.value,
        compareDigest: existing?.compareDigest ?? null,
        before: existing ? { type: existing.type, value: existing.value } : null
      });
    }
  }

  return plan;
}

async function buildPlan(manifest) {
  const products = [];
  for (const entry of ensureArray(manifest.products)) {
    const current = await fetchProductByHandle(entry.handle);
    products.push(buildProductPlan(entry, current));
  }

  const customers = [];
  for (const entry of ensureArray(manifest.customers)) {
    const current = await fetchCustomerByEmail(entry.email);
    customers.push(buildCustomerPlan(entry, current));
  }

  return {
    generatedAt: new Date().toISOString(),
    products,
    customers
  };
}

function summarizePlan(plan) {
  const missingProducts = plan.products.filter((entry) => !entry.found).length;
  const missingCustomers = plan.customers.filter((entry) => !entry.found).length;
  const productUpdates = plan.products.filter((entry) => entry.update).length;
  const productTagChanges = plan.products.filter((entry) => entry.tags).length;
  const variantUpdates = plan.products.reduce((sum, entry) => sum + entry.variants.filter((variant) => variant.input).length, 0);
  const metafieldUpdates =
    plan.products.reduce((sum, entry) => sum + entry.metafields.length, 0) +
    plan.customers.reduce((sum, entry) => sum + entry.metafields.length, 0);
  const customerTagChanges = plan.customers.filter((entry) => entry.tags).length;
  const variantLookupErrors = plan.products.reduce(
    (sum, entry) => sum + entry.variants.filter((variant) => variant.error).length,
    0
  );

  return {
    products: plan.products.length,
    customers: plan.customers.length,
    missingProducts,
    missingCustomers,
    productUpdates,
    productTagChanges,
    variantUpdates,
    variantLookupErrors,
    customerTagChanges,
    metafieldUpdates
  };
}

function printSummary(summary) {
  console.log("Summary");
  console.log(`- products: ${summary.products}`);
  console.log(`- customers: ${summary.customers}`);
  console.log(`- missingProducts: ${summary.missingProducts}`);
  console.log(`- missingCustomers: ${summary.missingCustomers}`);
  console.log(`- productUpdates: ${summary.productUpdates}`);
  console.log(`- productTagChanges: ${summary.productTagChanges}`);
  console.log(`- variantUpdates: ${summary.variantUpdates}`);
  console.log(`- variantLookupErrors: ${summary.variantLookupErrors}`);
  console.log(`- customerTagChanges: ${summary.customerTagChanges}`);
  console.log(`- metafieldUpdates: ${summary.metafieldUpdates}`);
}

async function applyPlan(plan) {
  const applied = [];

  for (const product of plan.products) {
    if (!product.found) {
      applied.push({ kind: "product", identifier: product.identifier, status: "skipped", reason: "not found" });
      continue;
    }

    if (product.update) {
      await updateProduct(product.update.input);
      applied.push({ kind: "product", identifier: product.identifier, status: "updated", action: "productUpdate" });
    }

    if (product.tags?.add?.length) {
      await addTags(product.tags.id, product.tags.add);
      applied.push({ kind: "product", identifier: product.identifier, status: "updated", action: "tagsAdd", tags: product.tags.add });
    }

    if (product.tags?.remove?.length) {
      await removeTags(product.tags.id, product.tags.remove);
      applied.push({
        kind: "product",
        identifier: product.identifier,
        status: "updated",
        action: "tagsRemove",
        tags: product.tags.remove
      });
    }

    const variantInputs = product.variants.filter((variant) => variant.input).map((variant) => variant.input);
    if (variantInputs.length) {
      await updateProductVariants(product.productId, variantInputs);
      applied.push({
        kind: "product",
        identifier: product.identifier,
        status: "updated",
        action: "productVariantsBulkUpdate",
        count: variantInputs.length
      });
    }

    if (product.metafields.length) {
      await setMetafields(product.metafields.map(({ before, ...metafield }) => metafield));
      applied.push({
        kind: "product",
        identifier: product.identifier,
        status: "updated",
        action: "metafieldsSet",
        count: product.metafields.length
      });
    }

    if (!product.update && !product.tags && !variantInputs.length && !product.metafields.length) {
      applied.push({ kind: "product", identifier: product.identifier, status: "noop" });
    }
  }

  for (const customer of plan.customers) {
    if (!customer.found) {
      applied.push({ kind: "customer", identifier: customer.identifier, status: "skipped", reason: "not found" });
      continue;
    }

    if (customer.tags?.add?.length) {
      await addTags(customer.tags.id, customer.tags.add);
      applied.push({ kind: "customer", identifier: customer.identifier, status: "updated", action: "tagsAdd", tags: customer.tags.add });
    }

    if (customer.tags?.remove?.length) {
      await removeTags(customer.tags.id, customer.tags.remove);
      applied.push({
        kind: "customer",
        identifier: customer.identifier,
        status: "updated",
        action: "tagsRemove",
        tags: customer.tags.remove
      });
    }

    if (customer.metafields.length) {
      await setMetafields(customer.metafields.map(({ before, ...metafield }) => metafield));
      applied.push({
        kind: "customer",
        identifier: customer.identifier,
        status: "updated",
        action: "metafieldsSet",
        count: customer.metafields.length
      });
    }

    if (!customer.tags && !customer.metafields.length) {
      applied.push({ kind: "customer", identifier: customer.identifier, status: "noop" });
    }
  }

  return {
    appliedAt: new Date().toISOString(),
    applied
  };
}

function writeReport(filePath, payload) {
  if (!filePath) {
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(args.manifestPath);
  const reportPath = args.reportPath ? path.resolve(args.reportPath) : null;
  const manifest = readJson(manifestPath);
  const validationErrors = validateManifest(manifest);

  if (validationErrors.length) {
    console.error("Manifest validation failed:");
    for (const error of validationErrors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  if (args.mode === "validate") {
    const payload = {
      ok: true,
      validatedAt: new Date().toISOString(),
      manifestPath
    };
    writeReport(reportPath, payload);
    console.log("Manifest is valid.");
    return;
  }

  const plan = await buildPlan(manifest);
  const summary = summarizePlan(plan);
  printSummary(summary);

  const payload = {
    manifestPath,
    mode: args.mode,
    summary,
    plan
  };

  if (args.mode === "plan") {
    writeReport(reportPath, payload);
    return;
  }

  const applyResult = await applyPlan(plan);
  payload.applyResult = applyResult;
  writeReport(reportPath, payload);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
