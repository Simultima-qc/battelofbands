export function isValidMeasurementId(value) {
  return /^G-[A-Z0-9]+$/i.test(String(value || '').trim())
}

export function createGa4HtmlPlugin(measurementId) {
  const id = String(measurementId || '').trim()

  return {
    name: 'battle-of-bands-ga4-html-bootstrap',

    transformIndexHtml() {
      if (!isValidMeasurementId(id)) return []

      const serializedId = JSON.stringify(id)

      return [
        {
          tag: 'script',
          attrs: {
            async: true,
            src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`,
            'data-bob-ga': id,
          },
          injectTo: 'head-prepend',
        },
        {
          tag: 'script',
          attrs: {
            'data-bob-ga-bootstrap': id,
          },
          children: `
window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function gtag(){ window.dataLayer.push(arguments); };
window.gtag('js', new Date());
window.gtag('config', ${serializedId}, { send_page_view: false });
`.trim(),
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}
