import { createContext, useContext, useState } from 'react'
import { translations } from './translations'

const LanguageContext = createContext(null)

const STORAGE_KEY = 'bob_lang'
const DEFAULT_LANG = 'fr'
export const SUPPORTED_LANGS = [
  { code: 'fr', label: 'FR' },
  { code: 'en', label: 'EN' },
  { code: 'es', label: 'ES' },
]

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return SUPPORTED_LANGS.find(l => l.code === saved) ? saved : DEFAULT_LANG
  })

  function setLang(code) {
    localStorage.setItem(STORAGE_KEY, code)
    setLangState(code)
  }

  // t(key) → translated string, with optional {placeholder} replacement
  function t(key, vars = {}) {
    const dict = translations[lang] || translations[DEFAULT_LANG]
    let str = dict[key] ?? translations[DEFAULT_LANG][key] ?? key
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, v)
    }
    return str
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
