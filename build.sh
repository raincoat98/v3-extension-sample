#!/bin/bash

# VerdantFlow 프로젝트 빌드 스크립트

set -e  # 오류 발생 시 스크립트 중단

echo "🔨 빌드 시작..."

# 색상 정의
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 웹 앱 빌드
echo -e "\n${BLUE}📦 웹 앱 빌드 중...${NC}"
cd web
if [ ! -d "node_modules" ]; then
  echo "📥 웹 앱 의존성 설치 중..."
  npm install
fi
npm run build
echo -e "${GREEN}✅ 웹 앱 빌드 완료: web/dist${NC}"
cd ..

# 2. Extension 빌드
echo -e "\n${BLUE}📦 Extension 빌드 중...${NC}"
cd extension
if [ ! -d "node_modules" ]; then
  echo "📥 Extension 의존성 설치 중..."
  npm install
fi
npm run build
echo -e "${GREEN}✅ Extension 빌드 완료: extension/dist${NC}"
cd ..

echo -e "\n${GREEN}🎉 모든 빌드 완료!${NC}"
echo -e "${YELLOW}📁 빌드 결과물:${NC}"
echo "  - 웹 앱: web/dist"
echo "  - Extension: extension/dist"

