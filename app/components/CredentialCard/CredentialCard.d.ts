import { CredentialRecordRaw } from '../../model/credential';

export type CredentialCardProps = {
  rawCredentialRecord: CredentialRecordRaw,
  onPressIssuer: (issuerId: string) => void,
}
