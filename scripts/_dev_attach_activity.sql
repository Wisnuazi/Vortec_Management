SELECT id, action, "entityType", description, "createdAt"
FROM "ActivityLog"
WHERE action LIKE 'task.attachment%'
ORDER BY "createdAt" DESC
LIMIT 10;
