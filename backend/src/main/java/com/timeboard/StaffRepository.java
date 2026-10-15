package com.timeboard;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StaffRepository extends JpaRepository<Staff, Long> {
    List<Staff> findAllByOrderBySortOrderAsc();
}
