package service

import (
	"context"
	"database/sql"
	"net/http"
	"time"
)

func (s Service) resolveInvitePreview(ctx context.Context, rawURL, code string) (map[string]any, int, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT i.code,i.server_id,i.uses,i.max_uses,i.expires_at,
		       s.name AS server_name,
		       s.logo_url AS server_logo_url,
		       s.created_at AS server_created_at,
		       (SELECT COUNT(*) FROM memberships m WHERE m.server_id=s.id) AS member_count,
		       (SELECT COUNT(*)
		          FROM memberships m2
		          JOIN presence p ON p.user_id=m2.user_id
		         WHERE m2.server_id=s.id AND COALESCE(p.status,'offline') <> 'offline') AS online_count
		  FROM invites i
		  JOIN servers s ON s.id=i.server_id
		 WHERE i.code=?
		 LIMIT 1`,
		code,
	)

	var inviteCode, serverID, serverName, serverLogoURL, serverCreatedAt string
	var uses int
	var maxUses sql.NullInt64
	var expiresAt sql.NullTime
	var memberCount, onlineCount int

	if err := row.Scan(
		&inviteCode,
		&serverID,
		&uses,
		&maxUses,
		&expiresAt,
		&serverName,
		&serverLogoURL,
		&serverCreatedAt,
		&memberCount,
		&onlineCount,
	); err != nil {
		return nil, 0, err
	}

	description := "Invite code " + inviteCode
	if maxUses.Valid {
		description += " · " + itoa(uses) + "/" + itoa(int(maxUses.Int64)) + " uses"
	}

	return map[string]any{
		"url":         normalizeURL(rawURL),
		"title":       "Join " + serverName + " on OpenCom",
		"description": description,
		"siteName":    "OpenCom",
		"imageUrl":    serverLogoURL,
		"action": map[string]any{
			"label": "Join Server",
			"url":   normalizeURL(rawURL),
		},
		"hasMeta": true,
		"kind":    "opencom_invite",
		"invite": map[string]any{
			"code":            inviteCode,
			"serverId":        serverID,
			"serverName":      serverName,
			"serverLogoUrl":   serverLogoURL,
			"memberCount":     memberCount,
			"onlineCount":     onlineCount,
			"serverCreatedAt": serverCreatedAt,
		},
	}, http.StatusOK, nil
}

func (s Service) resolveGiftPreview(ctx context.Context, rawURL, code string) (map[string]any, int, error) {
	row := s.db.QueryRowContext(ctx, `SELECT status,expires_at,grant_days FROM boost_gifts WHERE code=? LIMIT 1`, code)

	var status string
	var expiresAt time.Time
	var grantDays int
	if err := row.Scan(&status, &expiresAt, &grantDays); err != nil {
		return nil, 0, err
	}

	active := status == "active" && expiresAt.After(time.Now())
	description := "This gift is unavailable."
	if active {
		description = itoa(grantDays) + " day Boost gift ready to redeem."
	}

	var action any
	if active {
		action = map[string]any{
			"label": "Redeem Gift",
			"url":   normalizeURL(rawURL),
		}
	}

	return map[string]any{
		"url":         normalizeURL(rawURL),
		"title":       "OpenCom Boost Gift",
		"description": description,
		"siteName":    "OpenCom",
		"imageUrl":    "",
		"action":      action,
		"hasMeta":     true,
		"kind":        "opencom_gift",
	}, http.StatusOK, nil
}
