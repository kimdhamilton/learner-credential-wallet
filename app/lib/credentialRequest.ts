import { authorize } from 'react-native-app-auth';

import { ChapiCredentialRequest, ChapiCredentialRequestParams } from '../types/chapi';
import { Credential } from '../types/credential';
import { DidRecordRaw } from '../model';

import { createVerifiablePresentation } from './present';
import { issuerAuthRegistry } from './issuerAuth';
import { parseResponseBody } from './parseResponse';
import { extractCredentialsFrom, verifyVerifiableObject, VerifiableObject } from './verifiableObject';

export type CredentialRequestParams = {
  auth_type?: string;
  issuer: string;
  vc_request_url: string;
  challenge?: string;
}

export function isCredentialRequestParams(params?: Record<string, unknown>): params is CredentialRequestParams {
  const { issuer, vc_request_url } = (params || {} as CredentialRequestParams);
  return issuer !== undefined && vc_request_url !== undefined;
}

export function getChapiCredentialRequest(params: Record<string, unknown>): ChapiCredentialRequest {
  const { request: requestString } = (params as ChapiCredentialRequestParams);
  if (!requestString) {
    throw new Error('[getChapiCredentialRequest] The credential request was malformed.');
  }
  return JSON.parse(requestString);
}

export function isChapiCredentialRequestParams(params: Record<string, unknown>): params is ChapiCredentialRequestParams {
  const request = getChapiCredentialRequest(params);
  return isChapiCredentialRequest(request);
}

export function isChapiCredentialRequest(request: any): request is ChapiCredentialRequest {
  const { credentialRequestOrigin, protocols } = (request || {} as ChapiCredentialRequest);

  const hasChapiCredentialRequestFields = credentialRequestOrigin !== undefined && protocols !== undefined;
  if (!hasChapiCredentialRequestFields) {
    return false;
  }

  const hasChapiCredentialRequestProtocolFields = [
    'OID4VCI',
    'OID4VP',
    'vcapi'
  ].some((field: string) => {
    return !!protocols[field];
  });

  return hasChapiCredentialRequestProtocolFields;
}

export async function requestCredential(credentialRequestParams: CredentialRequestParams, didRecord: DidRecordRaw): Promise<Credential[]> {
  const {
    auth_type = 'code',
    issuer,
    vc_request_url,
    challenge,
  } = credentialRequestParams;

  console.log('Credential request params', credentialRequestParams);

  let accessToken;

  switch (auth_type) {
  case 'code': {
    if (!issuerAuthRegistry.isInRegistry(issuer)) {
      throw new Error(`Issuer "${issuer}" not found in registry.`);
    }
    const oidcConfig = issuerAuthRegistry.entryFor(issuer);
    // There needs to be a delay before authenticating or the app errors out.
    await new Promise((res) => setTimeout(res, 1000));
    console.log('Launching OIDC auth:', oidcConfig);

    try {
      console.log('authorize() called with:', oidcConfig);
      ({accessToken} = await authorize(oidcConfig));
      console.log('Received access token, requesting credential.');
    } catch (err) {
      console.error(err);
      throw new Error(
        'Unable to receive credential: Authorization with the issuer failed');
    }
    break;
  }
  case 'bearer':
    // Bearer token - do nothing. The 'challenge' param will be passed in the VP
    break;
  default:
    throw new Error(`Unsupported auth_type value: "${auth_type}".`);
  }

  const requestBody = await createVerifiablePresentation({didRecord, challenge});

  console.log(JSON.stringify(requestBody, null, 2));

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const request = {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  };

  const response = await fetch(vc_request_url, request);

  if (!response.ok) {
    console.error(`Issuer response (failed): ${JSON.stringify(response, null, 2)}`);
    throw new Error('Unable to receive credential: The issuer failed to return a valid response');
  }

  const responseBody = await parseResponseBody(response);
  const verifiableObject = responseBody as VerifiableObject;

  const verified = await verifyVerifiableObject(verifiableObject);
  if (!verified) {
    console.warn('Response was received, but could not be verified');
  }

  const credentials = extractCredentialsFrom(verifiableObject);
  if (credentials === null) {
    throw new Error('Unable to receive credential: The issuer failed to return a Verifiable Credential (VC) or Verifiable Presentation (VP)');
  }

  return credentials;
}
