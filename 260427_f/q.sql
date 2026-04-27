SELECT TOP 1 LINK_ID, LINK_MAP_ID, ST_ND_ID, ED_ND_ID
    FROM   RTM_LINK
    WHERE  LINK_ID     = #{linkId}
      AND  LINK_MAP_ID = #{nodeMapId}
      AND  (ST_ND_ID = #{nodeId} OR ED_ND_ID = #{nodeId})
