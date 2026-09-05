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
    batch: typeof routes['sms.batch']
    index: typeof routes['sms.index']
    show: typeof routes['sms.show']
    cancel: typeof routes['sms.cancel']
  }
  reports: {
    daily: typeof routes['reports.daily']
    summary: typeof routes['reports.summary']
  }
  balances: {
    index: typeof routes['balances.index']
  }
  webhooks: {
    index: typeof routes['webhooks.index']
    store: typeof routes['webhooks.store']
    show: typeof routes['webhooks.show']
    update: typeof routes['webhooks.update']
    destroy: typeof routes['webhooks.destroy']
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
    overview: typeof routes['admin.overview']
    tenants: {
      index: typeof routes['admin.tenants.index']
      store: typeof routes['admin.tenants.store']
      show: typeof routes['admin.tenants.show']
      update: typeof routes['admin.tenants.update']
    }
    clients: {
      index: typeof routes['admin.clients.index']
      store: typeof routes['admin.clients.store']
      update: typeof routes['admin.clients.update']
    }
    webhooks: {
      index: typeof routes['admin.webhooks.index']
    }
    reports: {
      daily: typeof routes['admin.reports.daily']
    }
    staff: {
      index: typeof routes['admin.staff.index']
      store: typeof routes['admin.staff.store']
      update: typeof routes['admin.staff.update']
    }
    messages: {
      index: typeof routes['admin.messages.index']
      show: typeof routes['admin.messages.show']
      cancel: typeof routes['admin.messages.cancel']
    }
    audit: {
      index: typeof routes['admin.audit.index']
    }
    jobs: {
      index: typeof routes['admin.jobs.index']
      retry: typeof routes['admin.jobs.retry']
      destroy: typeof routes['admin.jobs.destroy']
    }
    gateways: {
      index: typeof routes['admin.gateways.index']
      show: typeof routes['admin.gateways.show']
      update: typeof routes['admin.gateways.update']
      approve: typeof routes['admin.gateways.approve']
      claimCode: typeof routes['admin.gateways.claimCode']
      diagnostics: typeof routes['admin.gateways.diagnostics']
      enable: typeof routes['admin.gateways.enable']
      disable: typeof routes['admin.gateways.disable']
    }
    operators: {
      index: typeof routes['admin.operators.index']
      store: typeof routes['admin.operators.store']
      show: typeof routes['admin.operators.show']
      update: typeof routes['admin.operators.update']
      ussd: {
        upsert: typeof routes['admin.operators.ussd.upsert']
        destroy: typeof routes['admin.operators.ussd.destroy']
      }
    }
    sims: {
      update: typeof routes['admin.sims.update']
    }
    ussd: {
      run: typeof routes['admin.ussd.run']
      show: typeof routes['admin.ussd.show']
    }
  }
  root: typeof routes['root']
  health: {
    live: typeof routes['health.live']
    ready: typeof routes['health.ready']
    metrics: typeof routes['health.metrics']
  }
}
