package com.timeboard;

import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class ApiController {

    private final StaffRepository staffRepo;
    private final ReservationRepository reservationRepo;

    public ApiController(StaffRepository staffRepo, ReservationRepository reservationRepo) {
        this.staffRepo = staffRepo;
        this.reservationRepo = reservationRepo;
    }

    // ───── Staff ─────

    @GetMapping("/staff")
    public List<Staff> listStaff() {
        return staffRepo.findAllByOrderBySortOrderAsc();
    }

    @PostMapping("/staff")
    @ResponseStatus(HttpStatus.CREATED)
    public Staff createStaff(@RequestBody Staff staff) {
        staff.setId(null);
        return staffRepo.save(staff);
    }

    @PutMapping("/staff/{id}")
    public Staff updateStaff(@PathVariable Long id, @RequestBody Staff staff) {
        Staff found = staffRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        found.setName(staff.getName());
        found.setDotColor(staff.getDotColor());
        found.setSortOrder(staff.getSortOrder());
        return staffRepo.save(found);
    }

    @DeleteMapping("/staff/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteStaff(@PathVariable Long id) {
        staffRepo.deleteById(id);
    }

    // ───── Reservation ─────

    @GetMapping("/reservations")
    public List<Reservation> listReservations(@RequestParam LocalDate date) {
        return reservationRepo.findByDateOrderByStartMinAsc(date);
    }

    /** 예약이 있는 날짜 목록 — 미니 달력 점 표시용 */
    @GetMapping("/reservations/dates")
    public List<LocalDate> reservationDates() {
        return reservationRepo.findDistinctDates();
    }

    @PostMapping("/reservations")
    @ResponseStatus(HttpStatus.CREATED)
    public Reservation createReservation(@RequestBody Reservation r) {
        r.setId(null);
        return reservationRepo.save(r);
    }

    @PutMapping("/reservations/{id}")
    public Reservation updateReservation(@PathVariable Long id, @RequestBody Reservation r) {
        Reservation found = reservationRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        found.setStaffId(r.getStaffId());
        found.setDate(r.getDate());
        found.setStartMin(r.getStartMin());
        found.setDurationMin(r.getDurationMin());
        found.setTitle(r.getTitle());
        found.setSubtitle(r.getSubtitle());
        return reservationRepo.save(found);
    }

    @DeleteMapping("/reservations/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteReservation(@PathVariable Long id) {
        reservationRepo.deleteById(id);
    }
}
