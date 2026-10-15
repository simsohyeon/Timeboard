package com.timeboard;

import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ReservationRepository extends JpaRepository<Reservation, Long> {
    List<Reservation> findByDateOrderByStartMinAsc(LocalDate date);

    @Query("select distinct r.date from Reservation r")
    List<LocalDate> findDistinctDates();
}
