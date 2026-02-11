/**
 * Claves de AsyncStorage para API y sesión.
 */
export const STORAGE_KEYS = {
  access_token: 'access_token',
  username: 'username',
  unique_guid: 'unique_guid',
  api_base_url: 'api_base_url',
  api_timeout: 'api_timeout',
  api_user_agent: 'api_user_agent',
  api_custom_inventory_config_enabled: 'api_custom_inventory_config_enabled',
} as const;
