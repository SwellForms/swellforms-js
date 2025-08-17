// src/index.ts

export type Json =
    | string
    | number
    | boolean
    | null
    | Json[]
    | { [k: string]: Json }

const API_HOST = 'https://app.swellforms.com'
const API_VERSION = 'v1'

const ENDPOINTS = {
    submit: (formId: string) => `${API_HOST}/api/${API_VERSION}/forms/${formId}/submit`,
    validate: (formId: string) => `${API_HOST}/api/${API_VERSION}/forms/${formId}/validate`,
    fields: (formId: string) => `${API_HOST}/api/${API_VERSION}/forms/${formId}/fields`,
}

export interface SubmitResultOk<T = any> {
    ok: true
    status: number
    data: T
}

export interface SubmitResultErr {
    ok: false
    status: 422
    errors: Record<string, string[]>
    data?: any
}

export type SubmitResult<T = any> = SubmitResultOk<T> | SubmitResultErr

export interface ValidateResultOk {
    valid: true
    message?: string
}

export interface ValidateResultErr {
    valid: false
    errors: Record<string, string[]>
    message?: string
}

export type ValidateResult = ValidateResultOk | ValidateResultErr

export interface FormField {
    id: string
    label: string
    name?: string
    type: string
    required?: boolean
    placeholder?: string
    options?: Array<{ value: string; label: string }>
    meta?: Record<string, Json>
}

export interface FieldsResponse {
    formId: string
    fields: FormField[]
}

export class SwellformsError extends Error {
    status: number
    code?: string
    errors?: Record<string, string[]>
    constructor(message: string, status: number, code?: string, errors?: Record<string, string[]>) {
        super(message)
        this.name = 'SwellformsError'
        this.status = status
        this.code = code
        this.errors = errors
    }
}

function toPlain<T = unknown>(input: T): any {
    if (input == null || typeof input !== 'object') return input
    if (Array.isArray(input)) return input.map(toPlain)
    if (input instanceof Date) return input.toISOString()

    // Vue ref heuristic
    if ('value' in (input as any)) {
        const keys = Object.keys(input as any)
        if (keys.length === 1 && keys[0] === 'value') return toPlain((input as any).value)
    }

    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(input as Record<string, any>)) {
        const pv = toPlain(v)
        if (pv !== undefined) out[k] = pv
    }
    return out
}

function normalizeErrors(raw: any): Record<string, string[]> {
    const bag: Record<string, string[]> = {}
    const source = raw?.errors && typeof raw.errors === 'object' ? raw.errors : raw
    if (!source || typeof source !== 'object') return bag
    for (const [key, val] of Object.entries(source)) {
        const arr = Array.isArray(val) ? (val as any[]).filter(v => typeof v === 'string') as string[] : []
        const fieldId = key.startsWith('fields.') ? key.slice(7) : key
        if (!bag[fieldId]) bag[fieldId] = []
        bag[fieldId].push(...arr)
    }
    return bag
}

async function fetchJSON(
    url: string,
    init: RequestInit,
    fetchImpl?: typeof fetch,
    timeoutMs = 15000
) {
    const _fetch = fetchImpl ?? fetch
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : undefined
    const id = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : undefined
    try {
        const res = await _fetch(url, { ...init, signal: ctrl?.signal })
        const text = await res.text()
        const json = text ? (() => { try { return JSON.parse(text) } catch { return undefined } })() : undefined
        return { res, json }
    } catch (err: any) {
        if (err?.name === 'AbortError') throw new SwellformsError('Request timed out', 0, 'TIMEOUT')
        throw new SwellformsError(err?.message || 'Network error', 0, 'NETWORK')
    } finally {
        if (id) clearTimeout(id)
    }
}

export class SwellForm {
    private formId: string
    private fields: Record<string, any>
    private errors: Record<string, string[]> = {}
    private processing = false

    constructor(formId: string, initialFields: Record<string, any> = {}) {
        this.formId = formId
        this.fields = { ...initialFields }
    }

    // ---------- mutation ----------
    setField(id: string, value: any) {
        this.fields[id] = value
    }
    setFields(map: Record<string, any>) {
        Object.assign(this.fields, map)
    }

    // ---------- read ----------
    getField<T = any>(id: string): T | undefined {
        return this.fields[id] as T | undefined
    }
    getFields(): Record<string, any> {
        return { ...this.fields }
    }

    // ---------- state ----------
    isProcessing(): boolean {
        return this.processing
    }
    isValid(): boolean
    isValid(fieldId: string): boolean
    isValid(arg?: string): boolean {
        if (typeof arg === 'string') return !this.hasError(arg)
        return Object.keys(this.errors).length === 0
    }
    hasError(fieldId: string): boolean {
        const errs = this.errors[fieldId]
        return Array.isArray(errs) && errs.length > 0
    }
    getFieldError(fieldId: string): string | undefined {
        const errs = this.errors[fieldId]
        return Array.isArray(errs) && errs.length ? errs[0] : undefined
    }
    getFormErrors(): Record<string, string[]> {
        return { ...this.errors }
    }
    hasFormErrors(): boolean {
        return Object.keys(this.errors).length > 0
    }

    // ---------- network ----------
    async validate(
        opts?: { only?: string[] },
        fetchImpl?: typeof fetch
    ): Promise<ValidateResult> {
        this.processing = true
        try {
            const body = this.withMeta({
                formId: this.formId,
                fields: toPlain(this.fields),
                ...(opts?.only?.length ? { only: opts.only } : {}),
            })

            const { res, json } = await fetchJSON(
                ENDPOINTS.validate(this.formId),
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify(body),
                },
                fetchImpl
            )

            // Success contract: 200 { valid: true }
            if (res.status === 200 && json?.valid === true) {
                this.errors = {}
                return { valid: true, message: json?.message }
            }

            // Validation contract: 422 { errors: { ... } }
            if (res.status === 422) {
                this.errors = normalizeErrors(json)
                return { valid: false, errors: this.getFormErrors(), message: json?.message }
            }

            throw new SwellformsError(`Unexpected status ${res.status}`, res.status, 'UNEXPECTED')
        } finally {
            this.processing = false
        }
    }

    async validateField(fieldId: string, fetchImpl?: typeof fetch): Promise<ValidateResult> {
        return this.validate({ only: [fieldId] }, fetchImpl)
    }

    async submit<T = any>(
        overrides?: { fields?: Record<string, Json> },
        fetchImpl?: typeof fetch
    ): Promise<SubmitResult<T>> {
        this.processing = true
        try {
            const merged = { ...this.fields, ...(overrides?.fields || {}) }
            const body = this.withMeta({
                formId: this.formId,
                fields: toPlain(merged),
            })

            const { res, json } = await fetchJSON(
                ENDPOINTS.submit(this.formId),
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify(body),
                },
                fetchImpl
            )

            if (res.status === 422) {
                this.errors = normalizeErrors(json)
                return { ok: false, status: 422, errors: this.getFormErrors(), data: json }
            }

            if (res.ok) {
                this.errors = {}
                return { ok: true, status: res.status, data: json as T }
            }

            if (res.status === 429) throw new SwellformsError('Rate limited', res.status, 'RATE_LIMITED')
            if (res.status === 409) throw new SwellformsError('Conflict', res.status, 'CONFLICT')
            if (res.status >= 500) throw new SwellformsError('Server error', res.status, 'SERVER')
            throw new SwellformsError(`Unexpected status ${res.status}`, res.status, 'UNEXPECTED')
        } finally {
            this.processing = false
        }
    }

    async fetchFields(fetchImpl?: typeof fetch): Promise<FieldsResponse> {
        const { res, json } = await fetchJSON(
            ENDPOINTS.fields(this.formId),
            { method: 'GET', headers: { 'Accept': 'application/json' } },
            fetchImpl
        )
        if (!res.ok) {
            if (res.status === 404) throw new SwellformsError('Form not found', res.status, 'NOT_FOUND')
            if (res.status === 401 || res.status === 403) throw new SwellformsError('Unauthorized', res.status, 'UNAUTHORIZED')
            throw new SwellformsError(`Failed to fetch fields (${res.status})`, res.status, 'UNEXPECTED')
        }
        const fields = Array.isArray(json) ? json : (json?.fields ?? [])
        return { formId: this.formId, fields }
    }

    // ---------- utils ----------
    private withMeta(body: any) {
        const originUrl = typeof window !== 'undefined' ? window.location.host : ''
        const fullUrl = typeof window !== 'undefined' ? window.location.href : ''
        return { ...body, originUrl, fullUrl }
    }
}

// Optional single-shot helpers (use the class under the hood)
export async function submitForm<T = any>(
    payload: { formId: string; fields?: Record<string, Json> },
    fetchImpl?: typeof fetch
): Promise<SubmitResult<T>> {
    const f = new SwellForm(payload.formId, payload.fields || {})
    return f.submit(undefined, fetchImpl)
}

export async function validateForm(
    payload: { formId: string; fields?: Record<string, Json>; only?: string[] },
    fetchImpl?: typeof fetch
): Promise<ValidateResult> {
    const f = new SwellForm(payload.formId, payload.fields || {})
    return f.validate(payload.only ? { only: payload.only } : undefined, fetchImpl)
}

export default SwellForm
