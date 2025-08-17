# @swellforms/js

Core JavaScript SDK for interacting with [SwellForms](https://swellforms.com) from browsers and Node. It provides a tiny class for managing form state and a couple of convenience helpers for one-off calls.

- Works in ESM and CommonJS environments

- First-class TypeScript types

- Pluggable fetch for Node or custom transports

> ⚠ This package is under active development and is not yet stable. Use at your own risk.

> ⚠ This package is not needed if you are using the embeddable script or iFrame from SwellForms. It is intended for use in custom applications where you need to manage form state or submit forms programmatically.

- TBC: Links to other packages such as Nuxt.js, React, etc. embeddable script docs ...


## Install

```bash
npm i @swellforms/js
# or
pnpm add @swellforms/js
# or
yarn add @swellforms/js
```

## Usage

### Importing

The package ships a dual build.
    
#### ESM

```ts
import SwellForm, { submitForm, validateForm } from "@swellforms/js";
````

#### CommonJS

```ts
const { submitForm, validateForm } = require("@swellforms/js");
const SwellForm = require("@swellforms/js").default; // default export
```

### Quick start

Submit a form in one call:

```javascript
import { submitForm } from "@swellforms/js";

const res = await submitForm({
  formId: "sf_aZx90qLp",
  fields: {
    fullName: "Jane Doe",
    emailAddress: "jane@example.com",
    message: "Hello from the SDK",
  },
});

if (res.ok) {
  console.log("Submitted", res.status, res.data);
} else {
  console.log("Validation errors", res.errors);
}
```
Validate before submit:

```javascript
import { validateForm } from "@swellforms/js";

const vr = await validateForm({
    formId: "sf_aZx90qLp",
    fields: { emailAddress: "not-an-email" },
});

if (!vr.valid) {
    console.log(vr.errors); // { emailAddress: ["The email must be a valid email address."] }
}
```

### Using the SwellForm class

SwellForm helps you manage fields and errors between requests.

```javascript
import SwellForm from "@swellforms/js";

const form = new SwellForm("sf_aZx90qLp", { emailAddress: "" });

form.setField("emailAddress", "jane@example.com");

// Validate one field
await form.validateField("emailAddress");

if (form.isValid()) {
  const result = await form.submit();
  if (result.ok) {
    console.log("Success", result.data);
  } else {
    console.log("Form errors", result.errors);
  }
}
```

### Dynamic UI Generation
For cases where you want to render a form without hardcoding the HTML, you can fetch the field definitions directly from the API and build your UI dynamically.

```javascript
import SwellForm from "@swellforms/js";

const formContainer = document.getElementById("form-container");
const form = new SwellForm("sf_aZx90qLp");

async function buildDynamicForm() {
  try {
    // 1. Fetch the field definitions from the API
    const fields = await form.fetchFields();

    // 2. Loop through the definitions and create HTML elements
    fields.forEach(field => {
      const label = document.createElement("label");
      label.textContent = field.label || field.name;
      label.htmlFor = field.name;

      let inputElement;

      // Handle different field types
      if (field.type === 'textarea') {
        inputElement = document.createElement('textarea');
      } else if (field.type === 'select') {
        inputElement = document.createElement('select');
        field.options?.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.textContent = option.label;
            inputElement.appendChild(opt);
        });
      } else {
        inputElement = document.createElement('input');
        inputElement.type = field.type;
      }
      
      // Assign common attributes
      inputElement.id = field.name;
      inputElement.name = field.name;
      inputElement.placeholder = field.placeholder || '';
      inputElement.required = field.required;

      // Add the elements to the container
      formContainer.appendChild(label);
      formContainer.appendChild(inputElement);
      formContainer.appendChild(document.createElement('br')); // for spacing
    });

    // Don't forget to add a submit button
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.textContent = 'Submit';
    formContainer.appendChild(submitButton);

  } catch (error) {
    console.error("Failed to build form:", error);
    formContainer.textContent = "Sorry, the form could not be loaded.";
  }
}

buildDynamicForm();

// You would then add a submit handler to the formContainer
// to collect the values and call form.submit()
```

### Plain JavaScript example (no framework)

```html
<!DOCTYPE html>
<html lang="en">
  <body>
    <form id="contact-form">
      <input type="text" id="fullName" placeholder="Full Name" />
      <input type="email" id="emailAddress" placeholder="Email" />
      <textarea id="message" placeholder="Message"></textarea>
      <button type="submit">Send</button>
    </form>
    <div id="errors"></div>

    <script type="module">
      import SwellForm from "https://cdn.skypack.dev/@swellforms/js";

      const form = new SwellForm("sf_aZx90qLp");
      const contactForm = document.getElementById("contact-form");
      const errorBox = document.getElementById("errors");

      contactForm.addEventListener("submit", async e => {
        e.preventDefault();

        form.setFields({
          fullName: document.getElementById("fullName").value,
          emailAddress: document.getElementById("emailAddress").value,
          message: document.getElementById("message").value,
        });

        const result = await form.submit();

        if (result.ok) {
          alert("Form submitted successfully!");
        } else {
          errorBox.innerHTML = JSON.stringify(result.errors, null, 2);
        }
      });
    </script>
  </body>
</html>
```

## API reference

### Types

- `Json` — serializable JSON primitive or structure.
- `SubmitResult<T>`
    - `{ ok: true; status: number; data: T }`
    - `{ ok: false; status: 422; errors: Record<string, string[]>; data?: any }`
- `ValidateResult`
    - `{ valid: true; message?: string }`
    - `{ valid: false; errors: Record<string, string[]>; message?: string }`
- `FieldsResponse` — `{ formId: string; fields: FormField[] }`.
- `SwellformsError` extends `Error` with properties: `status: number`, `code?: string`, `errors?: Record<string, string[]>`.

### Class: `new SwellForm(formId: string, initialFields: Record<string, any> = {})`

Creates a form model bound to a SwellForms form.

### Field mutation

- `setField(id: string, value: any)` — set a single field.
- `setFields(map: Record<string, any>)` — shallow-merge many fields.

### Read access

- `getField<T = any>(id: string): T | undefined`
- `getFields(): Record<string, any>` — returns a shallow copy.

### Client state

- `isProcessing(): boolean` — true while a network call is active.
- `isValid(): boolean` — true when there are no form errors.
- `isValid(fieldId: string): boolean` — true when the field has no error.
- `hasError(fieldId: string): boolean`
- `getFieldError(fieldId: string): string | undefined` — first error message for the field.
- `getFormErrors(): Record<string, string[]>` — a copy of the current error bag.
- `hasFormErrors(): boolean`

### Network methods

- `validate(opts?: { only?: string[] }, fetchImpl?: typeof fetch): Promise<ValidateResult>`
    - Sends `POST /api/v1/forms/:formId/validate` with the current fields.
    - On `200` with `{ valid: true }` it clears errors and returns `{ valid: true }`.
    - On `422` it normalizes and stores validation errors and returns `{ valid: false, errors }`.
- `validateField(fieldId: string, fetchImpl?: typeof fetch): Promise<ValidateResult>`
    - Shorthand for `validate({ only: [fieldId] })`.
- `submit<T = any>(overrides?: { fields?: Record<string, Json> }, fetchImpl?: typeof fetch): Promise<SubmitResult<T>>`
    - Sends `POST /api/v1/forms/:formId/submit`.
    - On `422` returns `{ ok: false, status: 422, errors }` and stores errors.
    - On `2xx` returns `{ ok: true, status, data }` and clears errors.
    - On `409`, `429`, or `5xx` throws `SwellformsError` with a `code` of `CONFLICT`, `RATE_LIMITED`, or `SERVER`.
- `fetchFields(fetchImpl?: typeof fetch): Promise<FieldsResponse>`
    - Requests the form definition from `GET /api/v1/forms/:formId/fields`.
    - On `404` throws `SwellformsError("Form not found", 404, "NOT_FOUND")`.
    - On `401` or `403` throws `SwellformsError("Unauthorized", ...)`.

### Serialization and metadata

- The SDK serializes values through a safe converter:
    - `Date` becomes ISO string via `toISOString()`.
    - Arrays and plain objects are mapped recursively.
    - Vue refs are unwrapped if they look like `{ value: any }`.
    - `undefined` is omitted from payloads.
- Each request includes basic metadata:
    - `originUrl` — `window.location.host` when available, else empty string.
    - `fullUrl` — `window.location.href` when available, else empty string.

### Error normalization

Server validation errors are normalized into `Record<string, string[]>`.

If a key starts with `fields.`, the prefix is stripped. For example:

```json
{
  "errors": {
    "fields.emailAddress": ["The email must be a valid email address."]
  }
}

```

becomes:

```json
{
  "emailAddress": ["The email must be a valid email address."]
}

```

---

## One-shot helpers

`submitForm<T>(payload: { formId: string; fields?: Record<string, Json> }, fetchImpl?: typeof fetch): Promise<SubmitResult<T>>`

Creates a temporary `SwellForm` under the hood and calls `submit`. Useful for simple flows.

`validateForm(payload: { formId: string; fields?: Record<string, Json>; only?: string[] }, fetchImpl?: typeof fetch): Promise<ValidateResult>`

Creates a temporary `SwellForm` and calls `validate`.

---

## Using a custom fetch

If your runtime does not have `fetch`:

```jsx
const fetch = require("node-fetch");
const { submitForm } = require("@swellforms/js");

submitForm({ formId: "sf_abc", fields: { emailAddress: "x@y.z" } }, fetch)
  .then(r => console.log(r))
  .catch(err => console.error(err));

```

You can pass `fetchImpl` to `validate`, `validateField`, `submit`, and `fetchFields`.

---

## Timeouts and aborts

All requests use an internal `AbortController` with a 15 second timeout. On timeout the SDK throws `SwellformsError` with `code = "TIMEOUT"` and `status = 0`.

---

## Endpoints used

The SDK targets these SwellForms endpoints by default:

- `POST /api/v1/forms/:formId/validate`
- `POST /api/v1/forms/:formId/submit`
- `GET /api/v1/forms/:formId/fields`

All requests send and expect JSON.

---

## Troubleshooting

- **Cannot require ESM**: Use `require('@swellforms/js')` only if your bundler or Node resolves the CJS entry. This package publishes CJS at `dist/index.cjs` and maps it via `exports.require`.
- **No fetch in Node**: Provide a fetch implementation using the optional `fetchImpl` parameter.
- **Validation errors keep showing**: Call `isValid()` or inspect `getFormErrors()`. Errors are cleared on successful `validate` (200) or successful `submit` (2xx).
- **Cross-origin blocks**: The SDK includes `originUrl` and `fullUrl` in the body to help with origin checks. Make sure your backend CORS and origin rules allow your site.

## Documentation

TBC - Link to website documentation

## **Contributing

TBC**

## License
[MIT License](./LICENSE) © 2025 [Keith Mifsud](https://keith-mifsud.me) and [SwellAI Ltd](https://swellai.ltd). All rights reserved. 


## Contact
For any questions or issues related to SwellForms, please contact us at [Support](mailto:support@swellforms.com). 

For issues related to this SDK, please open an issue on the [GitHub repository](https://github.com/SwellForms/swellforms-js)

