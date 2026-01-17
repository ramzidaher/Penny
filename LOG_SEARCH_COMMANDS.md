# Log Search Commands

## Recommended ADB Logcat Command

To capture all relevant OAuth flow logs, use this command:

```bash
adb -s RFCX20QGP3H logcat | grep -E "FLOW_|ConnectBankScreen|truelayerService|exchangeCodeForTokens|fetchAndStoreProviderName|storeTokens|getTokens|getAllConnections|connectionId|codePrefix|providerName|codeToConnectionId|connectionIdToProvider|cloudGetAccounts|cloudAddAccount|AccountsScreen" > logcat_output.txt
```

## Alternative: More Focused Command

If you want to focus specifically on the OAuth flow:

```bash
adb -s RFCX20QGP3H logcat | grep -E "FLOW_|ConnectBankScreen|truelayerService|connectionId|codePrefix|providerName|exchangeCodeForTokens|fetchAndStoreProviderName" > logcat_output.txt
```

## Search Keywords in Logs

After capturing logs, search for these keywords in `logcat_output.txt`:

### Flow Control Keywords:
- `FLOW_START` - OAuth code detected
- `FLOW_OAUTH_CODE_RECEIVED` - Processing new code
- `FLOW_HANDLE_OAUTH_CALLBACK` - Callback handler started
- `FLOW_TOKEN_EXCHANGE_START` - Token exchange beginning
- `FLOW_BACKEND_TOKEN_EXCHANGE` - Backend returned connectionId
- `FLOW_TOKEN_EXCHANGE_END` - Token exchange completed
- `FLOW_TOKEN_STORAGE_START` - Storing tokens
- `FLOW_TOKEN_STORAGE_END` - Tokens stored and verified
- `FLOW_PROVIDER_FETCH_START` - Fetching provider name
- `FLOW_PROVIDER_STORAGE` - Provider name stored
- `FLOW_PROVIDER_FETCH_END` - Provider fetch completed
- `FLOW_CONNECTION_LOAD_START` - Loading connections
- `FLOW_CONNECTION_LOAD` - Individual connection loaded
- `FLOW_CONNECTION_LOAD_COMPLETE` - All connections loaded
- `FLOW_CONNECTION_LOAD_END` - Connection loading finished
- `FLOW_SKIP` - Code already processed

### Data Tracking Keywords:
- `connectionId` - Track which connection ID is used
- `codePrefix` - First 20 chars of OAuth code
- `fullCode` - Complete OAuth code
- `providerName` - Bank/provider name
- `codeToConnectionId` - Mapping from code to connection ID
- `connectionIdToProvider` - Mapping from connection ID to provider
- `accessTokenPrefix` - First 30 chars of access token

### Function Names:
- `exchangeCodeForTokens` - Token exchange function
- `fetchAndStoreProviderName` - Provider name fetch function
- `storeTokens` - Token storage function
- `getTokens` - Token retrieval function
- `getAllConnections` - Connection loading function

## How to Trace the Issue

1. **Search for `FLOW_START`** - Find when OAuth code is received
2. **Search for `codeToConnectionId`** - See which connectionId was created from that code
3. **Search for `FLOW_PROVIDER_FETCH_END`** - See which provider name was stored
4. **Search for `FLOW_CONNECTION_LOAD`** - See what connections are loaded
5. **Compare `connectionId` and `providerName`** at each step to find mismatches

## Note

The `FLOW_` logs are sent via fetch() to an external service. If they don't appear in console logs, check the external service logs or add console.log statements alongside the fetch() calls.
