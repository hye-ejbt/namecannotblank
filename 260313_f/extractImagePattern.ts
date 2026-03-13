const extractImagePattern = async (): Promise<void> => {
  // ZIP 생성 및 엑셀 워크북 인스턴스 초기화
  const zip = new JSZip();
  const workbook = new ExcelJS.Workbook();
  const imageData: any[] = [];

  // 엑셀 파일 페치 및 버퍼 로드
  const resp = await fetch('/data/pattern_250819.xlsx');
  const arrayBuffer = await resp.arrayBuffer();
  const data = await workbook.xlsx.load(arrayBuffer);

  for (const sheet of data.worksheets) {
    const images = sheet.getImages();

    // 행별 이미지 카운트 추적 (0부터 시작)
    const rowImgCount: Record<number, number> = {};

    for (const image of images) {
      const img = workbook.getImage(Number(image.imageId));
      if (!img || !img.buffer) continue;

      const row = image.range.tl.nativeRow;
      const col = image.range.tl.nativeCol;
      const cellRow = row + 1;

      // K~O 열 범위(col 10~14) 밖의 이미지는 건너뜀 (걸침 고려하여 9도 허용)
      if (col < 9 || col > 14) continue;

      const r = sheet.getRow(cellRow);
      const baseValue = String(r.getCell(1).value ?? '');

      // 해당 행에서 몇 번째 이미지인지 카운트
      if (!(row in rowImgCount)) rowImgCount[row] = 0;
      const imgIndex = rowImgCount[row];
      rowImgCount[row] += 1;

      // 이미지 순서에 따라 접미사 결정
      // 0번째(메인): 접미사 없음, 1번째~4번째(에로우1~4): _1 ~ _4
      let code = '';
      if (imgIndex === 0) {
        code = baseValue;
      } else {
        code = `${baseValue}_${imgIndex}`;
      }

      zip.file(`${code}.${img.extension}`, img.buffer);

      // 이미지 메타데이터 배열에 기록
      const imgFileName = `img_r${row}_c${col}.${img.extension}`;
      imageData.push({
        row: row,
        col: col,
        name: imgFileName,
        ext: `.${img.extension}`,
      });
    }
  }

  // 최종 ZIP 파일 생성 및 브라우저 다운로드 URL 추출
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipUrl = URL.createObjectURL(zipBlob);

  // 다운로드 링크 업데이트 (Zustand, Redux 액션 호출 또는 로컬 Set State)
  setDownloadLinkPattern(zipUrl);
};

// 컴포넌트 마운트 시 데이터 추출 로직 최초 1회 실행
useEffect(() => {
  extractImagePattern();
}, []);
