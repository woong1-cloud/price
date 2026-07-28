export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function errorResponse(error) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error(error);

  // 22P02 = invalid_text_representation. uuid 자리에 uuid가 아닌 값이 온 경우다
  // (예: /api/projects/not-a-uuid). 서버 잘못이 아니라 요청이 잘못된 것이므로
  // 500이 아니라 400으로 돌려준다. 더 구체적인 메시지가 필요한 라우트는 자기
  // 자리에서 ApiError로 먼저 던지면 되고, 여기는 그물을 빠져나간 경우를 받는다.
  if (error?.code === '22P02') {
    return Response.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  return Response.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
}
