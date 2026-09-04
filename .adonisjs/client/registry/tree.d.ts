/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  client: {
    token: {
      store: typeof routes['client.token.store']
      destroy: typeof routes['client.token.destroy']
    }
  }
  sms: {
    store: typeof routes['sms.store']
    index: typeof routes['sms.index']
    show: typeof routes['sms.show']
    cancel: typeof routes['sms.cancel']
  }
  gateway: {
    register: typeof routes['gateway.register']
    claim: typeof routes['gateway.claim']
    provision: typeof routes['gateway.provision']
    sims: {
      sync: typeof routes['gateway.sims.sync']
    }
    results: typeof routes['gateway.results']
  }
  auth: {
    newAccount: {
      store: typeof routes['auth.new_account.store']
    }
    accessTokens: {
      store: typeof routes['auth.access_tokens.store']
    }
  }
  profile: {
    profile: {
      show: typeof routes['profile.profile.show']
    }
    accessTokens: {
      destroy: typeof routes['profile.access_tokens.destroy']
    }
  }
  admin: {
    gateways: {
      index: typeof routes['admin.gateways.index']
      show: typeof routes['admin.gateways.show']
      approve: typeof routes['admin.gateways.approve']
      disable: typeof routes['admin.gateways.disable']
    }
  }
}
