export interface WelcomeMessages {
  greeting: (hour: number) => string
  choose: string
  cloudManagerTitle: string
  cloudManagerDescription: string
  appBuilderTitle: string
  appBuilderDescription: string
  fallbackName: string
}

const welcomeMessages: Record<string, WelcomeMessages> = {
  it: {
    greeting: (hour) => hour < 12 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera',
    choose: 'Scegli una toolbox',
    cloudManagerTitle: 'Cloud Manager CLI',
    cloudManagerDescription: 'Organizzazioni, programmi, ambienti e comandi',
    appBuilderTitle: 'App Builder',
    appBuilderDescription: 'Progetti e workspace di Adobe Developer Console',
    fallbackName: 'collega'
  },
  en: {
    greeting: (hour) => hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening',
    choose: 'Choose a toolbox',
    cloudManagerTitle: 'Cloud Manager CLI',
    cloudManagerDescription: 'Organizations, programs, environments and commands',
    appBuilderTitle: 'App Builder',
    appBuilderDescription: 'Adobe Developer Console projects and workspaces',
    fallbackName: 'there'
  },
  es: {
    greeting: (hour) => hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches',
    choose: 'Elige una toolbox',
    cloudManagerTitle: 'Cloud Manager CLI',
    cloudManagerDescription: 'Organizaciones, programas, entornos y comandos',
    appBuilderTitle: 'App Builder',
    appBuilderDescription: 'Proyectos y espacios de trabajo de Adobe Developer Console',
    fallbackName: 'bienvenido'
  },
  fr: {
    greeting: (hour) => hour < 18 ? 'Bonjour' : 'Bonsoir',
    choose: 'Choisissez une toolbox',
    cloudManagerTitle: 'Cloud Manager CLI',
    cloudManagerDescription: 'Organisations, programmes, environnements et commandes',
    appBuilderTitle: 'App Builder',
    appBuilderDescription: 'Projets et espaces de travail Adobe Developer Console',
    fallbackName: 'bonjour'
  },
  de: {
    greeting: (hour) => hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend',
    choose: 'Toolbox auswählen',
    cloudManagerTitle: 'Cloud Manager CLI',
    cloudManagerDescription: 'Organisationen, Programme, Umgebungen und Befehle',
    appBuilderTitle: 'App Builder',
    appBuilderDescription: 'Adobe Developer Console-Projekte und Workspaces',
    fallbackName: 'willkommen'
  }
}

export function getWelcomeMessages(languages: readonly string[]): WelcomeMessages {
  const locale = languages
    .map((language) => language.split(/[-_]/)[0].toLowerCase())
    .find((language) => Object.prototype.hasOwnProperty.call(welcomeMessages, language))
  return welcomeMessages[locale ?? 'en']
}