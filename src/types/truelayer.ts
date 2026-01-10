// TrueLayer API Types

export interface TrueLayerTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface TrueLayerAccount {
  account_id: string;
  account_type: string;
  account_number?: {
    iban?: string;
    number?: string;
    sort_code?: string;
    swift_bic?: string;
  };
  currency: string;
  display_name: string;
  provider: {
    display_name: string;
    logo_uri: string;
    provider_id: string;
  };
  update_timestamp: string;
}

export interface TrueLayerAccountsResponse {
  results: TrueLayerAccount[];
}

export interface TrueLayerBalance {
  available: number;
  current: number;
  overdraft?: number;
  currency: string;
}

export interface TrueLayerBalanceResponse {
  results: TrueLayerBalance[];
}

export interface TrueLayerCard {
  account_id: string;
  card_network: string;
  card_type: string;
  currency: string;
  display_name: string;
  partial_card_number: string;
  name_on_card?: string;
  provider: {
    display_name: string;
    logo_uri: string;
    provider_id: string;
  };
  update_timestamp: string;
}

export interface TrueLayerCardsResponse {
  results: TrueLayerCard[];
}

export interface TrueLayerTransaction {
  transaction_id: string;
  timestamp: string;
  description: string;
  transaction_type: string;
  transaction_category: string;
  transaction_classification: string[];
  amount: number;
  currency: string;
  merchant_name?: string;
  running_balance?: {
    amount: number;
    currency: string;
  };
  meta?: {
    provider_transaction_category?: string;
  };
}

export interface TrueLayerTransactionsResponse {
  results: TrueLayerTransaction[];
}

export interface TrueLayerConnection {
  id: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  createdAt: string;
}




