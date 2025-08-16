export type SubmitFormPayload = Record<string, unknown> & { formId: string }

const BASE_URL = 'https://app.swellforms.com/api/v1/forms/submit'

export async function submitForm(
    payload: SubmitFormPayload,
    fetchImpl?: typeof fetch // still optional override for SSR/testing
) {
    const _fetch = fetchImpl ?? fetch

    const originUrl = typeof window !== 'undefined' ? window.location.host : ''
    const fullUrl = typeof window !== 'undefined' ? window.location.href : ''
    const body = { ...payload, originUrl, fullUrl }

    const url = `${BASE_URL}/${payload.formId}`

    const res = await _fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body),
    })

    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`SwellForms submit failed: ${res.status} ${res.statusText} ${text}`)
    }

    return res.json()
}

export default submitForm
