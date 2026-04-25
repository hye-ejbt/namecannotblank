WITH 
-- (1) 링크 ID 목록 - 입력 순서가 곧 처리 순서
LinkSeq AS (
    SELECT 
        ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS seq_no,
        link_id
    FROM (VALUES
        (67666),
        (67667),
        (12345),
        (88888)
    ) AS t(link_id)
),
-- (2) 출발점
StartPos AS (
    SELECT 
        CAST(60610    AS INT) AS start_node_id,
        CAST(57160000 AS INT) AS start_map_id
),
-- (3) 재귀 CTE: 도엽 추적
Walk AS (
    -- ── Anchor: 첫 번째 링크 처리 ──
    SELECT 
        s.seq_no,
        s.link_id,
        l.LINK_MAP_ID                                        AS link_map_id,
        l.ST_ND_ID                                           AS st_nd_id,
        l.ED_ND_ID                                           AS ed_nd_id,
        CASE WHEN l.ST_ND_ID = sp.start_node_id 
             THEN l.ED_ND_ID ELSE l.ST_ND_ID END             AS next_node_id_raw,
        COALESCE(pair.NODE_ID, 
                 CASE WHEN l.ST_ND_ID = sp.start_node_id 
                      THEN l.ED_ND_ID ELSE l.ST_ND_ID END)   AS next_node_id,
        COALESCE(pair.NODE_MAP_ID, l.LINK_MAP_ID)            AS next_map_id,
        CASE WHEN n.NODE_KIND = 7 THEN 1 ELSE 0 END          AS crossed_bnd
    FROM      LinkSeq  s
    CROSS JOIN StartPos sp
    INNER JOIN RTM_LINK l
            ON l.LINK_ID     = s.link_id
           AND l.LINK_MAP_ID = sp.start_map_id
           AND (l.ST_ND_ID = sp.start_node_id OR l.ED_ND_ID = sp.start_node_id)
    LEFT JOIN RTM_NODE n
            ON n.NODE_ID     = CASE WHEN l.ST_ND_ID = sp.start_node_id 
                                    THEN l.ED_ND_ID ELSE l.ST_ND_ID END
           AND n.NODE_MAP_ID = l.LINK_MAP_ID
    OUTER APPLY (
        SELECT TOP 1 nn.NODE_ID, nn.NODE_MAP_ID
        FROM   RTM_NODE nn
        WHERE  nn.NODE_KIND   = 7
          AND  nn.NODE_MAP_ID <> l.LINK_MAP_ID
          AND  n.NODE_KIND    = 7
          AND  nn.NODE_XY_GRS.STEquals(n.NODE_XY_GRS) = 1
    ) pair
    WHERE s.seq_no = 1

    UNION ALL

    -- ── Recursive: 이전 행의 next_node_id / next_map_id 사용 ──
    SELECT 
        s.seq_no,
        s.link_id,
        l.LINK_MAP_ID,
        l.ST_ND_ID,
        l.ED_ND_ID,
        CASE WHEN l.ST_ND_ID = w.next_node_id 
             THEN l.ED_ND_ID ELSE l.ST_ND_ID END,
        COALESCE(pair.NODE_ID,
                 CASE WHEN l.ST_ND_ID = w.next_node_id 
                      THEN l.ED_ND_ID ELSE l.ST_ND_ID END),
        COALESCE(pair.NODE_MAP_ID, l.LINK_MAP_ID),
        CASE WHEN n.NODE_KIND = 7 THEN 1 ELSE 0 END
    FROM      Walk     w
    INNER JOIN LinkSeq s
            ON s.seq_no = w.seq_no + 1
    INNER JOIN RTM_LINK l
            ON l.LINK_ID     = s.link_id
           AND l.LINK_MAP_ID = w.next_map_id
           AND (l.ST_ND_ID = w.next_node_id OR l.ED_ND_ID = w.next_node_id)
    LEFT JOIN RTM_NODE n
            ON n.NODE_ID     = CASE WHEN l.ST_ND_ID = w.next_node_id 
                                    THEN l.ED_ND_ID ELSE l.ST_ND_ID END
           AND n.NODE_MAP_ID = l.LINK_MAP_ID
    OUTER APPLY (
        SELECT TOP 1 nn.NODE_ID, nn.NODE_MAP_ID
        FROM   RTM_NODE nn
        WHERE  nn.NODE_KIND   = 7
          AND  nn.NODE_MAP_ID <> l.LINK_MAP_ID
          AND  n.NODE_KIND    = 7
          AND  nn.NODE_XY_GRS.STEquals(n.NODE_XY_GRS) = 1
    ) pair
)
SELECT 
    seq_no,
    link_id,
    link_map_id,
    st_nd_id,
    ed_nd_id,
    next_node_id_raw,
    crossed_bnd
FROM Walk
ORDER BY seq_no
OPTION (MAXRECURSION 0);
