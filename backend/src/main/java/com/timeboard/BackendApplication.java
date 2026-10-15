package com.timeboard;

import java.time.LocalDate;
import java.util.List;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@SpringBootApplication
public class BackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(BackendApplication.class, args);
    }

    @Bean
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/api/**").allowedOriginPatterns("*").allowedMethods("*");
            }
        };
    }

    /** 데이터가 비어 있으면 데모 데이터 시드 */
    @Bean
    public CommandLineRunner seed(StaffRepository staffRepo, ReservationRepository reservationRepo) {
        return args -> {
            if (staffRepo.count() > 0) return;

            String blue = "#4a90d9";
            String[][] staffData = {
                {"사장님", blue}, {"ㅇ", blue}, {"ㄱ", blue}, {"ㄷ", blue}, {"미지정", null},
            };
            Long[] ids = new Long[staffData.length];
            for (int i = 0; i < staffData.length; i++) {
                Staff s = new Staff();
                s.setName(staffData[i][0]);
                s.setDotColor(staffData[i][1]);
                s.setSortOrder(i);
                ids[i] = staffRepo.save(s).getId();
            }

            LocalDate today = LocalDate.now();
            int[][] resvData = { // staffIdx, startMin, durationMin
                {0, 12 * 60, 60}, {2, 14 * 60 + 30, 90}, {4, 13 * 60, 60},
            };
            String[] subs = {"타이60분", "타이90", "타이90"};
            for (int i = 0; i < resvData.length; i++) {
                Reservation r = new Reservation();
                r.setStaffId(ids[resvData[i][0]]);
                r.setDate(today);
                r.setStartMin(resvData[i][1]);
                r.setDurationMin(resvData[i][2]);
                r.setTitle("고객 등록 필요");
                r.setSubtitle(subs[i]);
                reservationRepo.save(r);
            }
        };
    }
}
