package com.example.ebookreader.repository;

import com.example.ebookreader.entity.BookContent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;

@Repository
public interface BookContentRepository extends JpaRepository<BookContent, String> {
    ArrayList<BookContent> findByContentContainingIgnoreCase(String query);

    @Modifying
    @Transactional
    void deleteByBookId(String bookId);
}
