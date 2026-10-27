/**
 * Client auth FSM labels from `mountAuthFlow-CwBepKVw.js` / `index-BUtITCqw.js`.
 */
export const AUTH_STATE = {
  SignIn: "authStateSignIn",
  SignQr: "authStateSignQr",
  AuthCode: "authStateAuthCode",
  Password: "authStatePassword",
  SignUp: "authStateSignUp",
  SignImport: "authStateSignImport",
  EmailSetup: "authStateEmailSetup",
  EmailSetupCode: "authStateEmailSetupCode",
  SignedIn: "authStateSignedIn",
} as const;

export type AuthStateName = (typeof AUTH_STATE)[keyof typeof AUTH_STATE];

export interface AuthStateRecord<T extends AuthStateName = AuthStateName> {
  _: T;
  data?: unknown;
}
