#!/bin/bash

# Firebase Auth Extension 프로젝트 빌드 및 배포 스크립트

set -e  # 오류 발생 시 스크립트 중단

echo "🚀 빌드 및 배포 시작..."

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
cd ..

# 2. Extension 빌드
echo -e "\n${BLUE}📦 Extension 빌드 중...${NC}"
cd extension
if [ ! -d "node_modules" ]; then
  echo "📥 Extension 의존성 설치 중..."
  npm install
fi
npm run build
cd ..

# 3. 배포 옵션 확인
echo -e "\n${YELLOW}배포 옵션을 선택하세요:${NC}"
echo "1) Firebase Hosting만 배포 (웹 앱)"
echo "2) Firestore 규칙만 배포"
echo "3) 전체 배포 (Hosting + Firestore)"
echo "4) 취소"
read -p "선택 (1-4): " choice

case $choice in
  1)
    echo -e "\n${GREEN}🔥 Firebase Hosting 배포 중...${NC}"
    firebase deploy --only hosting
    ;;
  2)
    echo -e "\n${GREEN}🔥 Firestore 규칙 배포 중...${NC}"
    firebase deploy --only firestore
    ;;
  3)
    echo -e "\n${GREEN}🔥 전체 배포 중...${NC}"
    firebase deploy
    ;;
  4)
    echo "배포가 취소되었습니다."
    exit 0
    ;;
  *)
    echo "잘못된 선택입니다."
    exit 1
    ;;
esac

echo -e "\n${GREEN}✅ 배포 완료!${NC}"

