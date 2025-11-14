// Plugin events
export const PluginEvent = {
  MESSAGE_SENT: 'message:sent',
  MESSAGE_RECEIVED: 'message:received',
  AGENT_CHANGED: 'agent:changed',
  ERROR_OCCURRED: 'error:occurred',
  CONVERSATION_CREATED: 'conversation:created',
  CONVERSATION_UPDATED: 'conversation:updated',
  CONVERSATION_DELETED: 'conversation:deleted',
  WORKFLOW_STARTED: 'workflow:started',
  WORKFLOW_COMPLETED: 'workflow:completed',
  WORKFLOW_ERROR: 'workflow:error'
} as const;
