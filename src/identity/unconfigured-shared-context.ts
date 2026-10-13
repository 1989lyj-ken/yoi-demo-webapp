import { IdentityError } from "./contracts";
import type { SharedContextStore } from "./contracts";

/** Deliberately denies entry until reviewed Firestore rules and member mapping exist. */
export const unconfiguredSharedContext: SharedContextStore = {
  async resolveAuthorizedContext() {
    throw new IdentityError(
      "SERVICE_NOT_CONFIGURED",
      "登入成功，但展示身分尚未設定，請聯絡產品管理者。",
    );
  },
};
