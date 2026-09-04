import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'client.token.store': { paramsTuple?: []; params?: {} }
    'sms.store': { paramsTuple?: []; params?: {} }
    'sms.index': { paramsTuple?: []; params?: {} }
    'sms.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'sms.cancel': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
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
    'admin.gateways.index': { paramsTuple?: []; params?: {} }
    'admin.gateways.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.gateways.approve': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.gateways.disable': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
  }
  POST: {
    'client.token.store': { paramsTuple?: []; params?: {} }
    'sms.store': { paramsTuple?: []; params?: {} }
    'sms.cancel': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'client.token.destroy': { paramsTuple?: []; params?: {} }
    'gateway.register': { paramsTuple?: []; params?: {} }
    'gateway.claim': { paramsTuple?: []; params?: {} }
    'gateway.sims.sync': { paramsTuple?: []; params?: {} }
    'gateway.results': { paramsTuple?: []; params?: {} }
    'auth.new_account.store': { paramsTuple?: []; params?: {} }
    'auth.access_tokens.store': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.destroy': { paramsTuple?: []; params?: {} }
    'admin.gateways.approve': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'admin.gateways.disable': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
  }
  GET: {
    'sms.index': { paramsTuple?: []; params?: {} }
    'sms.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'gateway.provision': { paramsTuple?: []; params?: {} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'admin.gateways.index': { paramsTuple?: []; params?: {} }
    'admin.gateways.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
  }
  HEAD: {
    'sms.index': { paramsTuple?: []; params?: {} }
    'sms.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
    'gateway.provision': { paramsTuple?: []; params?: {} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'admin.gateways.index': { paramsTuple?: []; params?: {} }
    'admin.gateways.show': { paramsTuple: [ParamValue]; params: {'uid': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}