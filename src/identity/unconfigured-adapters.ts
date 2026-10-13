import {
  IdentityError,
  type IdentityProvider,
  type SharedContextStore,
} from "./contracts";

/** Safe startup adapters: authentication and shared reads fail closed until configured. */
export const unconfiguredIdentityProvider: IdentityProvider = {
  async signIn(_email, _password) {
    throw new IdentityError(
      "SERVICE_NOT_CONFIGURED",
      "展示登入服務尚未設定，請聯絡產品管理者。",
    );
  },
  async signOut() {},
  async currentAccount() {
    return null;
  },
};

export const unconfiguredSharedContext: SharedContextStore = {
  async resolveAuthorizedContext() {
    throw new IdentityError(
      "SERVICE_NOT_CONFIGURED",
      "展示身分與場次尚未連線，請稍後再試。",
    );
  },
};
