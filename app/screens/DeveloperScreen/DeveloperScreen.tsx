import React from 'react';
import { Linking, Text, View } from 'react-native';
import { Button } from 'react-native-elements';
import { FileLogger } from 'react-native-file-logger';
import * as RNFS from 'react-native-fs';
import DeviceInfo from 'react-native-device-info';

import { NavHeader } from '../../components';
import dynamicStyleSheet from './DeveloperScreen.styles';
import { DeveloperScreenProps } from './DeveloperScreen.d';
import { stageCredentials } from '../../store/slices/credentialFoyer';
import { credentials } from '../../mock/credential';
import { navigationRef } from '../../navigation';
import { Cache, CacheKey } from '../../lib/cache';
import { useAppDispatch, useDynamicStyles } from '../../hooks';
import { revokedCredential } from '../../mock/revokedCredential';
import { NavigationUtil } from '../../lib/navigationUtil';
import { shareData } from '../../lib/shareData';

export default function DeveloperScreen({ navigation }: DeveloperScreenProps): JSX.Element {
  const { styles, mixins } = useDynamicStyles(dynamicStyleSheet);
  const dispatch = useAppDispatch();

  const buttonStyleProps = {
    buttonStyle: mixins.buttonIcon,
    containerStyle: mixins.buttonContainerVertical,
    titleStyle: mixins.buttonIconTitle,
  };

  async function goToApproveCredentials() {
    if (navigationRef.isReady()) {
      const rawProfileRecord = await NavigationUtil.selectProfile();
      navigationRef.navigate('AcceptCredentialsNavigation', { 
        screen: 'ApproveCredentialsScreen',
        params: {
          rawProfileRecord,
        }
      });
    }
  }

  async function addMockCredentials() {
    await dispatch(stageCredentials(credentials));
    goToApproveCredentials();
  }

  async function addRevokedCredential() {
    await dispatch(stageCredentials([revokedCredential]));
    goToApproveCredentials();
  }

  function receiveCredentialThroughDeepLink() {
    Linking.openURL('dccrequest://request?issuer=https%3A%2F%2Fissuer.example.com&vc_request_url=https://verify.dcconsortium.org/request/credential&challenge=ke12345678-0001&auth_type=bearer');
  }

  function startShareRequest() {
    Linking.openURL('dccrequest://present?client_id=did%3Akey%3Az6MkpLDL3RoAoMRTwTgo3rs39ZwssfaPKtGdZw7AGRN7CK4W&nonce=123456&redirect_uri=https%3A%2F%2Fexample.com');
  }

  async function viewLogs() {
    const logData = await getLogData().catch(() => 'No logs found');

    async function onPressShare() {
      const date = new Date().valueOf();
      const fileName = `lcw-${date}.log`;

      await shareData(fileName, logData);
    }

    navigationRef.navigate('ViewSourceScreen', {
      screenTitle: 'Developer Logs',
      data: logData,
      buttonTitle: 'Send',
      onPressButton: onPressShare,
      noWrap: true,
    });
  }

  async function clearLogs() {
    await FileLogger.deleteLogFiles();
  }

  async function clearVerificationCache(): Promise<void> {
    await Cache.getInstance().removeAll(CacheKey.VerificationResult);
  }


  return (
    <>
      <NavHeader title="Developer Settings" goBack={navigation.goBack} />
      <View style={styles.container}>
        <Text style={styles.header}>General</Text>
        <Button {...buttonStyleProps} title="View developer logs" onPress={viewLogs} />
        <Button {...buttonStyleProps} title="Clear developer logs" onPress={clearLogs} />
        <Button {...buttonStyleProps} title="Clear verification cache" onPress={clearVerificationCache} />
        <View style={styles.spacer} />
        <Text style={styles.header}>Credentials</Text>
        <Button {...buttonStyleProps} title="Add mock credentials" onPress={addMockCredentials}/>
        <Button {...buttonStyleProps} title="Add revoked credential" onPress={addRevokedCredential} />
        <Button {...buttonStyleProps} title="Receive credential through deep link" onPress={receiveCredentialThroughDeepLink} />
        <Button {...buttonStyleProps} title="Credential share request with deep link" onPress={startShareRequest} />
        <View style={styles.spacer} />
      </View>
    </>
  );
}

async function getLogData(): Promise<string> {
  const build = DeviceInfo.getBuildNumber();
  const version = DeviceInfo.getVersion();
  const bundleId = DeviceInfo.getBundleId();
  const logInfo = (`Running ${bundleId} v${version}-build${build}`);

  const [path] = await FileLogger.getLogFilePaths();
  const data = await RNFS.readFile(path, 'utf8');
  const formattedData = data
    .replace(/\\n/g, '\n')
    .replace(/^(?!> )(.*)/gm, '  $1')
    .replace(/> /g, '');

  return `${logInfo}\n\n${formattedData}`;
}
