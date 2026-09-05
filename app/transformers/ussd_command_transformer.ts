import type OperatorUssdCommand from '#models/operator_ussd_command'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class UssdCommandTransformer extends BaseTransformer<OperatorUssdCommand> {
  toObject() {
    const command = this.resource

    return {
      kind: command.kind,
      command: command.command,
      steps: command.steps,
      parserKey: command.parserKey,
      isActive: command.isActive,
      updatedAt: command.updatedAt,
    }
  }
}
