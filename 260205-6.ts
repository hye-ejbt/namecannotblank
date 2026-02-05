/**
 * Transform.prototype.Cursor.select = 'custom' 방식과 완전히 동일한 동작
 */
class PrototypeCompatibleTransform extends ol_interaction_Transform {
  constructor(options: CustomTransformOptions = {}) {
    // 생성 전에 프로토타입 커서 백업
    const backupCursors = { ...(ol_interaction_Transform.prototype as any).Cursor };
    
    // 임시로 프로토타입 수정
    if (options.cursors) {
      Object.assign((ol_interaction_Transform.prototype as any).Cursor, options.cursors);
    }
    
    super(options);
    
    // 프로토타입 복원 (다른 인스턴스에 영향 없도록)
    Object.assign((ol_interaction_Transform.prototype as any).Cursor, backupCursors);
    
    // 이 인스턴스만의 커서 설정 유지
    if (options.cursors) {
      (this as any).Cursor = {
        ...(this as any).Cursor,
        ...options.cursors
      };
    }
  }

  public setSelectCursor(cursor: string): void {
    if ((this as any).Cursor) {
      (this as any).Cursor.select = cursor;
    }
  }

  public getSelectCursor(): string {
    return (this as any).Cursor?.select || 'pointer';
  }
}
