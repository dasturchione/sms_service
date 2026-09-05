import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'client.token.store': { paramsTuple?: []; params?: {} }
    'sms.store': { paramsTuple?: []; params?: {} }
    'sms.batch': { paramsTuple?: []; params?: {} }
    'sms.index': { paramsTuple?: []; params?: {} }
    'sms.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'sms.cancel': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'reports.daily': { paramsTuple?: []; params?: {} }
    'reports.summary': { paramsTuple?: []; params?: {} }
    'balances.index': { paramsTuple?: []; params?: {} }
    'webhooks.index': { paramsTuple?: []; params?: {} }
    'webhooks.store': { paramsTuple?: []; params?: {} }
    'webhooks.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'webhooks.update': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'webhooks.destroy': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'client.token.destroy': { paramsTuple?: []; params?: {} }
    'gateway.register': { paramsTuple?: []; params?: {} }
    'gateway.claim': { paramsTuple?: []; params?: {} }
    'gateway.provision': { paramsTuple?: []; params?: {} }
    'gateway.sims.sync': { paramsTuple?: []; params?: {} }
    'gateway.results': { paramsTuple?: []; params?: {} }
    'auth.new_account.store': { paramsTuple?: []; params?: {} }
    'auth.access_tokens.store': { paramsTuple?: []; params?: {} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.destroy': { paramsTuple?: []; params?: {} }
    'admin.overview': { paramsTuple?: []; params?: {} }
    'admin.tenants.index': { paramsTuple?: []; params?: {} }
    'admin.tenants.store': { paramsTuple?: []; params?: {} }
    'admin.tenants.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.tenants.update': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.clients.index': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.clients.store': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.clients.update': { paramsTuple: [ParamValue,ParamValue]; params: {'uid': ParamValue,'clientUid': ParamValue} }
    'admin.webhooks.index': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.reports.daily': { paramsTuple?: []; params?: {} }
    'admin.staff.index': { paramsTuple?: []; params?: {} }
    'admin.staff.store': { paramsTuple?: []; params?: {} }
    'admin.staff.update': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.messages.index': { paramsTuple?: []; params?: {} }
    'admin.messages.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.messages.cancel': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.audit.index': { paramsTuple?: []; params?: {} }
    'admin.jobs.index': { paramsTuple?: []; params?: {} }
    'admin.jobs.retry': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.jobs.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.gateways.index': { paramsTuple?: []; params?: {} }
    'admin.gateways.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.gateways.update': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.gateways.approve': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.gateways.claimCode': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.gateways.diagnostics': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.gateways.enable': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.gateways.disable': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.operators.index': { paramsTuple?: []; params?: {} }
    'admin.operators.store': { paramsTuple?: []; params?: {} }
    'admin.operators.show': { paramsTuple: [ParamValue]; params: {'code': ParamValue} }
    'admin.operators.update': { paramsTuple: [ParamValue]; params: {'code': ParamValue} }
    'admin.operators.ussd.upsert': { paramsTuple: [ParamValue]; params: {'code': ParamValue} }
    'admin.operators.ussd.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'code': ParamValue,'kind': ParamValue} }
    'admin.sims.update': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.ussd.run': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.ussd.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'root': { paramsTuple?: []; params?: {} }
    'health.live': { paramsTuple?: []; params?: {} }
    'health.ready': { paramsTuple?: []; params?: {} }
    'health.metrics': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'client.token.store': { paramsTuple?: []; params?: {} }
    'sms.store': { paramsTuple?: []; params?: {} }
    'sms.batch': { paramsTuple?: []; params?: {} }
    'sms.cancel': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'webhooks.store': { paramsTuple?: []; params?: {} }
    'client.token.destroy': { paramsTuple?: []; params?: {} }
    'gateway.register': { paramsTuple?: []; params?: {} }
    'gateway.claim': { paramsTuple?: []; params?: {} }
    'gateway.sims.sync': { paramsTuple?: []; params?: {} }
    'gateway.results': { paramsTuple?: []; params?: {} }
    'auth.new_account.store': { paramsTuple?: []; params?: {} }
    'auth.access_tokens.store': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.destroy': { paramsTuple?: []; params?: {} }
    'admin.tenants.store': { paramsTuple?: []; params?: {} }
    'admin.clients.store': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.staff.store': { paramsTuple?: []; params?: {} }
    'admin.messages.cancel': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.jobs.retry': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.gateways.approve': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.gateways.claimCode': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.gateways.enable': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.gateways.disable': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.operators.store': { paramsTuple?: []; params?: {} }
    'admin.ussd.run': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
  }
  GET: {
    'sms.index': { paramsTuple?: []; params?: {} }
    'sms.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'reports.daily': { paramsTuple?: []; params?: {} }
    'reports.summary': { paramsTuple?: []; params?: {} }
    'balances.index': { paramsTuple?: []; params?: {} }
    'webhooks.index': { paramsTuple?: []; params?: {} }
    'webhooks.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'gateway.provision': { paramsTuple?: []; params?: {} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'admin.overview': { paramsTuple?: []; params?: {} }
    'admin.tenants.index': { paramsTuple?: []; params?: {} }
    'admin.tenants.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.clients.index': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.webhooks.index': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.reports.daily': { paramsTuple?: []; params?: {} }
    'admin.staff.index': { paramsTuple?: []; params?: {} }
    'admin.messages.index': { paramsTuple?: []; params?: {} }
    'admin.messages.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.audit.index': { paramsTuple?: []; params?: {} }
    'admin.jobs.index': { paramsTuple?: []; params?: {} }
    'admin.gateways.index': { paramsTuple?: []; params?: {} }
    'admin.gateways.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.gateways.diagnostics': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.operators.index': { paramsTuple?: []; params?: {} }
    'admin.operators.show': { paramsTuple: [ParamValue]; params: {'code': ParamValue} }
    'admin.ussd.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'root': { paramsTuple?: []; params?: {} }
    'health.live': { paramsTuple?: []; params?: {} }
    'health.ready': { paramsTuple?: []; params?: {} }
    'health.metrics': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'sms.index': { paramsTuple?: []; params?: {} }
    'sms.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'reports.daily': { paramsTuple?: []; params?: {} }
    'reports.summary': { paramsTuple?: []; params?: {} }
    'balances.index': { paramsTuple?: []; params?: {} }
    'webhooks.index': { paramsTuple?: []; params?: {} }
    'webhooks.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'gateway.provision': { paramsTuple?: []; params?: {} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'admin.overview': { paramsTuple?: []; params?: {} }
    'admin.tenants.index': { paramsTuple?: []; params?: {} }
    'admin.tenants.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.clients.index': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.webhooks.index': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.reports.daily': { paramsTuple?: []; params?: {} }
    'admin.staff.index': { paramsTuple?: []; params?: {} }
    'admin.messages.index': { paramsTuple?: []; params?: {} }
    'admin.messages.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.audit.index': { paramsTuple?: []; params?: {} }
    'admin.jobs.index': { paramsTuple?: []; params?: {} }
    'admin.gateways.index': { paramsTuple?: []; params?: {} }
    'admin.gateways.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.gateways.diagnostics': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.operators.index': { paramsTuple?: []; params?: {} }
    'admin.operators.show': { paramsTuple: [ParamValue]; params: {'code': ParamValue} }
    'admin.ussd.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'root': { paramsTuple?: []; params?: {} }
    'health.live': { paramsTuple?: []; params?: {} }
    'health.ready': { paramsTuple?: []; params?: {} }
    'health.metrics': { paramsTuple?: []; params?: {} }
  }
  PATCH: {
    'webhooks.update': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.tenants.update': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.clients.update': { paramsTuple: [ParamValue,ParamValue]; params: {'uid': ParamValue,'clientUid': ParamValue} }
    'admin.staff.update': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.gateways.update': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.operators.update': { paramsTuple: [ParamValue]; params: {'code': ParamValue} }
    'admin.sims.update': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
  }
  DELETE: {
    'webhooks.destroy': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.jobs.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.operators.ussd.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'code': ParamValue,'kind': ParamValue} }
  }
  PUT: {
    'admin.operators.ussd.upsert': { paramsTuple: [ParamValue]; params: {'code': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}