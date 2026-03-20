public class PoiDataManager {

    private DbProcedureService dbProcedure;

    public void importAddressShp(File folder) {

        log("변경중 SHP 포팅 시작");

        Map<String, Integer> mapSourceShp = new HashMap<>();

        int nEMD = 0, nLi = 0, nEMDError = 0, nLiError = 0;

        // 1. SHP 파일 수집
        File[] files = folder.listFiles((dir, name) -> name.endsWith(".shp"));

        if (files == null) {
            log("변경중 SHP 포팅 취소");
            return;
        }

        for (File file : files) {
            String fileName = file.getName().replace(".shp", "");

            if (fileName.equals("TL_SCCO_EMD")) {
                mapSourceShp.put(file.getAbsolutePath(), 1);
                nEMD++;
            }

            if (fileName.equals("TL_SCCO_LI")) {
                mapSourceShp.put(file.getAbsolutePath(), 2);
                nLi++;
            }
        }

        log(String.format("대상 Shp 총 %d건 읍면동 : %d건, 리 : %d건 포팅 진행",
                mapSourceShp.size(), nEMD, nLi));

        // 2. 전처리
        boolean bOK = dbProcedure.prePorting();

        if (!bOK) {
            log("변경중 SHP 포팅 전처리 실패");
            return;
        }

        log("변경중 SHP 포팅 전처리 완료");

        // 3. 파일 처리
        for (Map.Entry<String, Integer> entry : mapSourceShp.entrySet()) {

            String shpPath = entry.getKey();
            int type = entry.getValue();

            log("대상 Shp [" + shpPath + "] 포팅 진행");

            try (
                ShapefileDataStore store = new ShapefileDataStore(new File(shpPath).toURI().toURL())
            ) {
                String typeName = store.getTypeNames()[0];
                SimpleFeatureSource source = store.getFeatureSource(typeName);
                SimpleFeatureCollection collection = source.getFeatures();

                try (SimpleFeatureIterator it = collection.features()) {

                    while (it.hasNext()) {

                        SimpleFeature feature = it.next();

                        Geometry geometry = (Geometry) feature.getDefaultGeometry();

                        GeoPolygon tempPolygon = new GeoPolygon();

                        // 4. 좌표 처리
                        Coordinate[] coords = geometry.getCoordinates();

                        for (Coordinate coord : coords) {

                            Point2D grs = convert(coord, "GRS80");
                            Point2D bes = convert(coord, "BESSEL");

                            if (isGRS80()) {
                                tempPolygon.addPoint(grs, true);
                                tempPolygon.addPoint(bes, false);
                            } else {
                                tempPolygon.addPoint(grs, false);
                                tempPolygon.addPoint(bes, true);
                            }
                        }

                        // 5. BCode 처리
                        String bcode = (String) feature.getAttribute(0);

                        if (type == 1) {
                            bcode = bcode.trim() + "00";
                        } else if (type == 2) {
                            bcode = bcode.trim();
                        } else {
                            bcode = "";
                        }

                        tempPolygon.setBcode(bcode);

                        // 6. DB 저장
                        boolean result = dbProcedure.insertPolygon(tempPolygon);

                        if (!result) {
                            if (type == 1) nEMDError++;
                            else if (type == 2) nLiError++;

                            if (bcode.isEmpty()) {
                                log(String.format("[%s] Bcode 미존재", shpPath));
                            } else {
                                log(String.format("[%s] 실패 [%s]", shpPath, bcode));
                            }
                        }
                    }
                }

            } catch (Exception e) {
                log("파일 처리 실패: " + shpPath);
                e.printStackTrace();
            }
        }

        // 7. 후처리
        bOK = dbProcedure.postPorting();

        if (bOK) {
            log("변경중 SHP 포팅 후처리 완료");
        } else {
            log("변경중 SHP 포팅 후처리 실패");
        }

        log(String.format(
                "대상 총 %d건 읍면동 : [%d/%d]건, 리 : [%d/%d]건 포팅 진행완료",
                mapSourceShp.size(),
                nEMD - nEMDError, nEMD,
                nLi - nLiError, nLi
        ));

        log("변경중 SHP 포팅 완료");
    }

    private void log(String msg) {
        System.out.println(msg);
    }

    private boolean isGRS80() {
        return true; // 환경 설정에 따라 변경
    }

    private Point2D convert(Coordinate coord, String type) {
        // 실제 좌표변환 로직 필요
        return new Point2D(coord.x, coord.y);
    }
}
