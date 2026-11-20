export const addAccount = {
  steps: ['Sign in', 'Steam Guard', 'Revocation code'],

  signInTitle: 'Sign in to Steam',
  login: 'Login',
  password: 'Password',
  proxy: 'Proxy',
  noProxy: 'No proxy',
  savePassword: 'Save the password, not just the session',
  savePasswordLabel: 'Save password',
  wrongLogin: 'Steam says the login or password is wrong',
  signingIn: 'Signing in…',
  signIn: 'Sign in',

  guardTitle: 'Steam Guard',
  guardOnPhone: (name: string) => `${name} has Steam Guard on a phone.`,
  noAuthenticator: (name: string) => `${name} has no mobile authenticator.`,
  method: 'Method',
  methods: {
    new: {
      name: 'Add a new authenticator',
      text: 'Made here and confirmed with a code Steam sends by SMS or email.',
    },
    move: {
      name: 'Move from phone',
      text: 'Officially through Steam, confirmed by SMS to the account’s phone number. Guard stops working on the phone.',
      noPhone:
        'The account has no phone number for Steam to send the SMS to. Use the revocation code or the .maFile instead.',
    },
    revocationCode: {
      name: 'Replace with the revocation code',
      text: 'The code is in the Steam app on the phone, in the Steam Guard settings. It takes Guard off the phone, then Steam confirms the new one by email.',
    },
    maFile: {
      name: 'Import its .maFile',
      text: 'If the account’s .maFile was saved from SDA or another app. Guard keeps working where it is now.',
    },
  },
  revocationCodeLabel: 'Revocation code',
  chooseMaFile: 'Choose .maFile',
  tradeHold:
    'For the first 7 days after adding Guard, trades are held. That’s how Steam works.',
  askingSteam: 'Asking Steam…',

  revocationTitle: 'Revocation code',
  revocationLead: (name: string) =>
    `The only way to remove Steam Guard from ${name} if this vault is lost. Keep a copy outside this computer.`,
  copy: 'Copy',
  saveTxt: 'Save .txt',
  savedAs: (file: string) => `Saved as ${file}`,
  stored: 'I stored the code somewhere safe',
  noRevocation: (name: string) =>
    `${name} is added, but Steam gave no revocation code.`,
  done: 'Done',

  guardCode: 'Steam Guard code',
  emailCode: 'Email code',
  moveFromPhone: 'Move from phone',
  confirmationCode: 'Confirmation code',
  code: 'Code',
  checking: 'Checking…',
  confirm: 'Confirm',
  signInPhoneText:
    'Enter the code Steam Guard shows in the Steam app on the account’s phone.',
  signInEmailText: 'Steam sent a code to the account’s email.',
  guardEmailText:
    'Steam sent a code to the account’s email. Enter it to turn on the new authenticator.',
  phoneEnding: (digits: string) => `the phone ending in ${digits}`,
  accountPhone: 'the account’s phone number',
  smsMove: (phone: string) =>
    `Steam sent an SMS to ${phone}. Once you enter it, Guard stops working on the phone.`,
  smsNew: (phone: string) =>
    `Steam sent an SMS to ${phone}. Enter it to turn on the new authenticator.`,
  guardAdded: 'Steam Guard added',
}
