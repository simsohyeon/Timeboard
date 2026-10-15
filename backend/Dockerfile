# Render 등 Docker 기반 무료 호스팅용
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY . .
RUN ./gradlew bootJar --no-daemon

FROM eclipse-temurin:21-jre
COPY --from=build /app/build/libs/*.jar /app.jar
# 무료 티어 메모리(512MB)에 맞춰 힙 제한
ENV JAVA_TOOL_OPTIONS="-Xmx256m"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app.jar"]
