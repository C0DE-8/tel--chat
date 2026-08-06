function rows(result) {
  return Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
}

function publicConversation(conversation) {
  return {
    id: conversation.id,
    status: conversation.status,
    visitorName: conversation.visitor_name,
    visitorEmail: conversation.visitor_email,
    visitorToken: conversation.visitor_token,
    createdAt: conversation.created_at,
    closedAt: conversation.closed_at
  };
}

function publicMessage(message) {
  return {
    id: message.id,
    conversationId: message.conversation_id,
    sender: message.sender,
    body: message.body,
    createdAt: message.created_at
  };
}

module.exports = { rows, publicConversation, publicMessage };
