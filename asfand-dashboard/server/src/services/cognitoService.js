import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  AdminConfirmSignUpCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { randomUUID } from 'node:crypto';

/** @type {Map<string, { sub: string, password: string, verified: boolean }>} */
const mockStore = new Map();

/** @type {Map<string, { code: string, expires: number }>} */
const mockResetCodes = new Map();

export function useCognitoMock() {
  return process.env.COGNITO_USE_MOCK === 'true';
}

function client() {
  const region = process.env.AWS_REGION ?? 'us-east-1';
  return new CognitoIdentityProviderClient({ region });
}

function poolId() {
  const id = process.env.COGNITO_USER_POOL_ID;
  if (!id) throw new Error('COGNITO_USER_POOL_ID is not set');
  return id;
}

function clientId() {
  const id = process.env.COGNITO_CLIENT_ID;
  if (!id) throw new Error('COGNITO_CLIENT_ID is not set');
  return id;
}

/**
 * @param {{ email: string, password: string, fullName: string }} p
 * @returns {Promise<{ sub: string }>}
 */
export async function cognitoSignUp(p) {
  const email = p.email.trim().toLowerCase();
  if (useCognitoMock()) {
    if (mockStore.has(email)) {
      const err = new Error('User already exists');
      err.name = 'UsernameExistsException';
      throw err;
    }
    const sub = randomUUID();
    mockStore.set(email, {
      sub,
      password: p.password,
      verified: process.env.MOCK_AUTO_VERIFY === 'true',
    });
    return { sub };
  }

  const res = await client().send(
    new SignUpCommand({
      ClientId: clientId(),
      Username: email,
      Password: p.password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'name', Value: p.fullName },
      ],
    })
  );
  const sub = res.UserSub;
  if (!sub) throw new Error('Cognito SignUp did not return UserSub');
  return { sub };
}

/** @param {string} email */
export async function cognitoAdminConfirmSignUp(email) {
  const e = email.trim().toLowerCase();
  if (useCognitoMock()) {
    const u = mockStore.get(e);
    if (u) u.verified = true;
    return;
  }
  await client().send(
    new AdminConfirmSignUpCommand({
      UserPoolId: poolId(),
      Username: e,
    })
  );
}

/**
 * @param {{ email: string, password: string }} p
 */
export async function cognitoInitiateAuth(p) {
  const email = p.email.trim().toLowerCase();
  if (useCognitoMock()) {
    const u = mockStore.get(email);
    if (!u || u.password !== p.password) {
      const err = new Error('Incorrect username or password');
      err.name = 'NotAuthorizedException';
      throw err;
    }
    if (!u.verified) {
      const err = new Error('User is not confirmed');
      err.name = 'UserNotConfirmedException';
      throw err;
    }
    return { cognitoSub: u.sub };
  }

  try {
    const res = await client().send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: clientId(),
        AuthParameters: {
          USERNAME: email,
          PASSWORD: p.password,
        },
      })
    );
    const idToken = res.AuthenticationResult?.IdToken;
    if (!idToken) throw new Error('No IdToken from Cognito');
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
    const sub = payload.sub;
    if (!sub) throw new Error('Invalid IdToken payload');
    return { cognitoSub: sub };
  } catch (e) {
    throw e;
  }
}

/** @param {{ email: string }} p */
export async function cognitoForgotPassword(p) {
  const email = p.email.trim().toLowerCase();
  if (useCognitoMock()) {
    if (!mockStore.has(email)) {
      // Do not leak existence
      return;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    mockResetCodes.set(email, { code, expires: Date.now() + 3600_000 });
    return;
  }
  await client().send(
    new ForgotPasswordCommand({
      ClientId: clientId(),
      Username: email,
    })
  );
}

/**
 * @param {{ email: string, code: string, newPassword: string }} p
 */
export async function cognitoConfirmForgotPassword(p) {
  const email = p.email.trim().toLowerCase();
  if (useCognitoMock()) {
    const entry = mockResetCodes.get(email);
    const u = mockStore.get(email);
    if (!entry || !u || entry.expires < Date.now() || entry.code !== p.code.trim()) {
      const err = new Error('Invalid verification code');
      err.name = 'CodeMismatchException';
      throw err;
    }
    u.password = p.newPassword;
    mockResetCodes.delete(email);
    return;
  }
  await client().send(
    new ConfirmForgotPasswordCommand({
      ClientId: clientId(),
      Username: email,
      ConfirmationCode: p.code.trim(),
      Password: p.newPassword,
    })
  );
}

/** Test helper */
export function __clearCognitoMock() {
  mockStore.clear();
  mockResetCodes.clear();
}
