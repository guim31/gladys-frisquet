// -----------------------------------------------------------------------------
// Every text the integration shows to the user, in the four languages of the
// Gladys interface (en, fr, de, es). German says "du", Spanish says "usted",
// like the rest of guim31's integrations. The vocabulary follows the Gladys
// interface (front/src/config/i18n) and, in French, the words of the Frisquet
// app and of the boiler's own display: confort, réduit, hors-gel, dérogation.
//
//   - NAMES    : feature and device names, in the language of the config
//                (fixed by Gladys when the device is created);
//   - TEXT     : the fixed texts (widget, statuses, option labels);
//   - MESSAGES : the texts built from a value (an action result, an error).
//
// test/i18n.test.js checks that every entry carries exactly the four
// languages, with no empty or too long text and no polite German.
// -----------------------------------------------------------------------------

/** The languages every text carries, in this order. */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

/** Feature and device names, by language (≤ 40 characters). */
export const NAMES = {
  en: {
    boiler: 'Boiler',
    outdoorTemperature: 'Outdoor temperature',
    hotWater: 'Hot water',
    hotWaterMode: 'Hot water mode',
    alarm: 'Alarm',
    alarmActive: 'Alarm active',
    holiday: 'Holiday mode',
    standby: 'Boiler on standby',
    heatingMonth: 'Heating gas (this month)',
    heatingYear: 'Heating gas (this year)',
    hotWaterMonth: 'Hot water gas (this month)',
    hotWaterYear: 'Hot water gas (this year)',
    zone: 'Zone',
    temperature: 'Room temperature',
    setpoint: 'Setpoint',
    comfort: 'Comfort setpoint',
    reduced: 'Reduced setpoint',
    frost: 'Frost protection setpoint',
    preset: 'Mode',
    override: 'Override running',
    boost: 'Boost',
    status: 'Current mode',
  },
  fr: {
    boiler: 'Chaudière',
    outdoorTemperature: 'Température extérieure',
    hotWater: 'Eau chaude',
    hotWaterMode: 'Mode eau chaude',
    alarm: 'Alarme',
    alarmActive: 'Alarme en cours',
    holiday: 'Mode vacances',
    standby: 'Chaudière en veille',
    heatingMonth: 'Gaz chauffage (ce mois)',
    heatingYear: 'Gaz chauffage (cette année)',
    hotWaterMonth: 'Gaz eau chaude (ce mois)',
    hotWaterYear: 'Gaz eau chaude (cette année)',
    zone: 'Zone',
    temperature: 'Température ambiante',
    setpoint: 'Consigne',
    comfort: 'Consigne confort',
    reduced: 'Consigne réduit',
    frost: 'Consigne hors-gel',
    preset: 'Mode',
    override: 'Dérogation en cours',
    boost: 'Boost',
    status: 'Mode en cours',
  },
  de: {
    boiler: 'Heizkessel',
    outdoorTemperature: 'Außentemperatur',
    hotWater: 'Warmwasser',
    hotWaterMode: 'Warmwassermodus',
    alarm: 'Alarm',
    alarmActive: 'Alarm aktiv',
    holiday: 'Urlaubsmodus',
    standby: 'Heizkessel im Standby',
    heatingMonth: 'Gas Heizung (dieser Monat)',
    heatingYear: 'Gas Heizung (dieses Jahr)',
    hotWaterMonth: 'Gas Warmwasser (dieser Monat)',
    hotWaterYear: 'Gas Warmwasser (dieses Jahr)',
    zone: 'Zone',
    temperature: 'Raumtemperatur',
    setpoint: 'Sollwert',
    comfort: 'Sollwert Komfort',
    reduced: 'Sollwert Absenkung',
    frost: 'Sollwert Frostschutz',
    preset: 'Modus',
    override: 'Übersteuerung aktiv',
    boost: 'Boost',
    status: 'Aktueller Modus',
  },
  es: {
    boiler: 'Caldera',
    outdoorTemperature: 'Temperatura exterior',
    hotWater: 'Agua caliente',
    hotWaterMode: 'Modo de agua caliente',
    alarm: 'Alarma',
    alarmActive: 'Alarma activa',
    holiday: 'Modo vacaciones',
    standby: 'Caldera en espera',
    heatingMonth: 'Gas calefacción (este mes)',
    heatingYear: 'Gas calefacción (este año)',
    hotWaterMonth: 'Gas agua caliente (este mes)',
    hotWaterYear: 'Gas agua caliente (este año)',
    zone: 'Zona',
    temperature: 'Temperatura ambiente',
    setpoint: 'Consigna',
    comfort: 'Consigna confort',
    reduced: 'Consigna reducida',
    frost: 'Consigna antihielo',
    preset: 'Modo',
    override: 'Derogación en curso',
    boost: 'Refuerzo',
    status: 'Modo actual',
  },
};

/** Fixed texts. */
export const TEXT = {
  // Modes of a zone (thermostat preset labels, widget, status)
  schedule: { en: 'Schedule', fr: 'Programme', de: 'Zeitplan', es: 'Programación' },
  comfort: { en: 'Comfort', fr: 'Confort', de: 'Komfort', es: 'Confort' },
  reduced: { en: 'Reduced', fr: 'Réduit', de: 'Absenkung', es: 'Reducido' },
  frost: { en: 'Frost protection', fr: 'Hors-gel', de: 'Frostschutz', es: 'Antihielo' },
  // Why the zone runs that mode (status text, in brackets)
  byProgramme: { en: 'schedule', fr: 'programme', de: 'Zeitplan', es: 'programación' },
  permanent: { en: 'permanent', fr: 'permanent', de: 'dauerhaft', es: 'permanente' },
  byOverride: { en: 'override', fr: 'dérogation', de: 'Übersteuerung', es: 'derogación' },
  byHoliday: { en: 'holiday', fr: 'vacances', de: 'Urlaub', es: 'vacaciones' },
  byBoost: { en: 'boost', fr: 'boost', de: 'Boost', es: 'refuerzo' },
  unknownMode: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },

  // Hot water modes (labels of the select)
  hw_max: { en: 'MAX', fr: 'MAX', de: 'MAX', es: 'MAX' },
  hw_eco: { en: 'Eco', fr: 'Éco', de: 'Eco', es: 'Eco' },
  hw_eco_timer: {
    en: 'Eco, scheduled',
    fr: 'Éco programmé',
    de: 'Eco mit Zeitplan',
    es: 'Eco programado',
  },
  hw_eco_plus: { en: 'Eco+', fr: 'Éco+', de: 'Eco+', es: 'Eco+' },
  hw_eco_plus_timer: {
    en: 'Eco+, scheduled',
    fr: 'Éco+ programmé',
    de: 'Eco+ mit Zeitplan',
    es: 'Eco+ programado',
  },
  hw_stop: { en: 'Off', fr: 'Arrêt', de: 'Aus', es: 'Apagado' },
  hw_on: { en: 'On', fr: 'Marche', de: 'Ein', es: 'Encendido' },

  noAlarm: { en: 'No alarm', fr: 'Aucune alarme', de: 'Kein Alarm', es: 'Ninguna alarma' },

  // Widget
  zones: {
    en: 'Heating zones',
    fr: 'Zones de chauffage',
    de: 'Heizzonen',
    es: 'Zonas de calefacción',
  },
  temperatureShort: { en: 'Room', fr: 'Ambiante', de: 'Raum', es: 'Ambiente' },
  setpointShort: { en: 'Setpoint', fr: 'Consigne', de: 'Sollwert', es: 'Consigna' },
  outdoorShort: { en: 'Outdoor', fr: 'Extérieur', de: 'Außen', es: 'Exterior' },
  mode: { en: 'Mode', fr: 'Mode', de: 'Modus', es: 'Modo' },
  setpoints: {
    en: 'Comfort / reduced',
    fr: 'Confort / réduit',
    de: 'Komfort / Absenkung',
    es: 'Confort / reducido',
  },
  override: { en: 'Override', fr: 'Dérogation', de: 'Übersteuern', es: 'Derogación' },
  endOverride: {
    en: 'End override',
    fr: 'Fin dérogation',
    de: 'Übersteuern beenden',
    es: 'Fin derogación',
  },
  holiday: { en: 'Holiday', fr: 'Vacances', de: 'Urlaub', es: 'Vacaciones' },
  alarm: { en: 'Alarm', fr: 'Alarme', de: 'Alarm', es: 'Alarma' },
  noZone: {
    en: 'No Frisquet zone yet: add the devices from the Discover tab of the integration.',
    fr: "Aucune zone Frisquet : ajoutez les appareils depuis l'onglet Découverte de l'intégration.",
    de: 'Noch keine Frisquet-Zone: Füge die Geräte im Tab „Entdecken“ der Integration hinzu.',
    es: 'Aún no hay ninguna zona Frisquet: añada los dispositivos desde la pestaña Descubrir de la integración.',
  },
  notConfigured: {
    en: 'Enter the e-mail and password of your Frisquet Connect account in the configuration.',
    fr: 'Renseignez l’e-mail et le mot de passe de votre compte Frisquet Connect dans la configuration.',
    de: 'Gib die E-Mail-Adresse und das Passwort deines Frisquet-Connect-Kontos in der Konfiguration ein.',
    es: 'Introduzca el correo electrónico y la contraseña de su cuenta Frisquet Connect en la configuración.',
  },

  // Connection status (Configuration screen)
  authFailed: {
    en: 'Frisquet Connect refused the e-mail or the password. Check them in the configuration.',
    fr: 'Frisquet Connect a refusé l’e-mail ou le mot de passe. Vérifiez-les dans la configuration.',
    de: 'Frisquet Connect hat die E-Mail-Adresse oder das Passwort abgelehnt. Prüfe sie in der Konfiguration.',
    es: 'Frisquet Connect rechazó el correo electrónico o la contraseña. Compruébelos en la configuración.',
  },
  maintenance: {
    en: 'Frisquet Connect is under maintenance: the integration will try again on its own.',
    fr: 'Frisquet Connect est en maintenance : l’intégration réessaiera d’elle-même.',
    de: 'Frisquet Connect wird gewartet: Die Integration versucht es selbst erneut.',
    es: 'Frisquet Connect está en mantenimiento: la integración volverá a intentarlo por sí sola.',
  },
  noBoiler: {
    en: 'No boiler is linked to this Frisquet Connect account.',
    fr: 'Aucune chaudière n’est liée à ce compte Frisquet Connect.',
    de: 'Mit diesem Frisquet-Connect-Konto ist kein Heizkessel verknüpft.',
    es: 'No hay ninguna caldera vinculada a esta cuenta Frisquet Connect.',
  },
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les journaux de l'intégration.",
    de: 'Die Initialisierung ist fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
};

/** Texts built from a value. */
export const MESSAGES = {
  unavailable: (detail) => ({
    en: `Frisquet Connect does not answer (${detail}). The integration will try again.`,
    fr: `Frisquet Connect ne répond pas (${detail}). L’intégration réessaiera.`,
    de: `Frisquet Connect antwortet nicht (${detail}). Die Integration versucht es erneut.`,
    es: `Frisquet Connect no responde (${detail}). La integración volverá a intentarlo.`,
  }),
  publishFailed: (detail) => ({
    en: `Publishing the devices to Gladys failed (${detail}).`,
    fr: `La publication des appareils dans Gladys a échoué (${detail}).`,
    de: `Die Geräte konnten nicht in Gladys veröffentlicht werden (${detail}).`,
    es: `La publicación de los dispositivos en Gladys ha fallado (${detail}).`,
  }),
  testOk: (boilers, zones) => ({
    en: `Connected: ${boilers} boiler(s), ${zones} heating zone(s). Add them from the Discover tab.`,
    fr: `Connexion réussie : ${boilers} chaudière(s), ${zones} zone(s) de chauffage. Ajoutez-les depuis l'onglet Découverte.`,
    de: `Verbunden: ${boilers} Heizkessel, ${zones} Heizzone(n). Füge sie im Tab „Entdecken“ hinzu.`,
    es: `Conexión correcta: ${boilers} caldera(s), ${zones} zona(s) de calefacción. Añádalas desde la pestaña Descubrir.`,
  }),
  /** `what` is itself a multi-language text (a mode). */
  orderSent: (target, what) => ({
    en: `${target}: ${what.en} requested. The boiler applies it within a few minutes.`,
    fr: `${target} : ${what.fr} demandé. La chaudière l’applique sous quelques minutes.`,
    de: `${target}: ${what.de} angefordert. Der Heizkessel übernimmt es in wenigen Minuten.`,
    es: `${target}: ${what.es} solicitado. La caldera lo aplica en unos minutos.`,
  }),
};

/**
 * One language of a multi-language text, English as the fallback.
 * @param {Record<string, string>} text
 * @param {string} language
 */
export function pick(text, language) {
  return text[language] ?? text.en;
}

/** The feature names of a language, English as the fallback. */
export function namesFor(language) {
  return NAMES[language] ?? NAMES.en;
}
